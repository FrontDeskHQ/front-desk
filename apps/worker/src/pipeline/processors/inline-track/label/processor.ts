import { createHash } from "node:crypto";

import { createAILogger, createLogger } from "@workspace/utils/logging";

import { AI_PRICING } from "../../../../lib/ai-pricing";
import { isRetryableError } from "../../../../lib/logging";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../../../core/types";
import type { SummarizeOutput } from "../../summarize";
import { classifyLabel } from "./classify";

// Below this score the classifier emits nothing.
const SUGGEST_THRESHOLD = 0.5;
// Auto-apply floor. Hardcoded rather than an org setting: nobody can calibrate
// this number from the settings page, and a real complaint should justify
// exposing it (ADR 0014).
const AUTO_THRESHOLD = 0.85;

export interface LabelClassifierOutput {
  /** True when the label was applied autonomously rather than suggested. */
  applied?: boolean;
  skipped?:
    | "autonomy_off"
    | "no_labels"
    | "below_threshold"
    | "already_applied";
  labelId?: string;
  confidence?: number;
}

export const labelClassifierProcessor: ProcessorDefinition<LabelClassifierOutput> =
  {
    name: "label_classifier",

    dependencies: ["summarize"],

    getIdempotencyKey(threadId: string): string {
      return `label_classifier:${threadId}`;
    },

    // Hash only the first inbound message id. Once classified, subsequent
    // inbound messages don't re-fire (first-inbound-only cadence). Label-set
    // churn intentionally does NOT invalidate. Manual re-read flows through the
    // same idempotency check as any other trigger.
    computeHash(context: ProcessorExecuteContext): string {
      const { thread } = context;
      return createHash("sha256").update(thread.id).digest("hex");
    },

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<LabelClassifierOutput>> {
      const { run, thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.label_classifier",
        jobId: context.context.jobId,
        organizationId: thread.organizationId,
        processor: "label_classifier",
        threadId,
      });
      const ai = createAILogger(requestLog, { cost: AI_PRICING });
      let status = 200;

      try {
        const autonomy = (await run.autonomy()).apply_label;
        if (autonomy === "off") {
          requestLog.set({
            outcome: { status: "skipped", reason: "autonomy_off" },
          });
          return {
            data: { skipped: "autonomy_off" },
            success: true,
            threadId,
          };
        }

        const orgLabels = await run.labels();

        if (orgLabels.length === 0) {
          requestLog.set({
            outcome: { status: "skipped", reason: "no_labels" },
          });
          return {
            data: { skipped: "no_labels" },
            success: true,
            threadId,
          };
        }

        const appliedLabelIds = new Set(
          (thread.labels ?? [])
            .filter((tl) => tl.enabled && tl.label?.enabled)
            .map((tl) => tl.labelId)
            .filter((id): id is string => Boolean(id))
        );

        const firstMessage = thread.messages?.toSorted((a, b) =>
          a.id.localeCompare(b.id)
        )[0];

        const summarizeOutput =
          context.context.getProcessorOutput<SummarizeOutput>(
            "summarize",
            threadId
          );

        const { labelId, confidence } = await classifyLabel(
          {
            firstMessageContent: firstMessage?.content ?? null,
            orgLabels: orgLabels.map((l) => ({ id: l.id, name: l.name })),
            summary: summarizeOutput?.summary ?? null,
            threadName: thread.name ?? null,
          },
          ai
        );

        if (!labelId || confidence < SUGGEST_THRESHOLD) {
          requestLog.set({
            classification: { confidence, threshold: SUGGEST_THRESHOLD },
            outcome: { status: "skipped", reason: "below_threshold" },
          });
          return {
            data: {
              confidence,
              labelId: undefined,
              skipped: "below_threshold",
            },
            success: true,
            threadId,
          };
        }

        if (appliedLabelIds.has(labelId)) {
          requestLog.set({
            classification: {
              confidence,
              labelId,
              threshold: SUGGEST_THRESHOLD,
            },
            outcome: { status: "skipped", reason: "already_applied" },
          });
          return {
            data: { confidence, labelId, skipped: "already_applied" },
            success: true,
            threadId,
          };
        }

        // `apply_label` has no action gate: it is local, reversible, and posts
        // nothing outside FrontDesk, so the threshold is the whole guard.
        // Deliberately stricter than the suggest floor — a wrong auto-applied
        // label is silent, where a wrong suggestion is merely declined.
        if (autonomy === "auto" && confidence >= AUTO_THRESHOLD) {
          const action = { kind: "apply_label", labelId } as const;
          try {
            await run.executeBundle([action]);
            requestLog.set({
              classification: {
                confidence,
                labelId,
                threshold: AUTO_THRESHOLD,
              },
              outcome: { status: "applied", action: "apply_label" },
            });
            return {
              data: { applied: true, confidence, labelId },
              success: true,
              threadId,
            };
          } catch (error) {
            // Same posture as the synthesis autonomy stage: a failed autonomous
            // execution falls back to the human rather than vanishing.
            requestLog.set({
              outcome: {
                status: "auto_failed",
                reason: "retained_for_review",
              },
            });
            requestLog.error(error instanceof Error ? error : String(error), {
              retryable: isRetryableError(error),
              step: "label_auto_apply",
            });
          }
        }

        await run.suggest({
          action: { kind: "apply_label", labelId },
          confidence,
          createdAt: new Date().toISOString(),
          generator: "label_classifier",
          id: `label:${threadId}`,
        });

        requestLog.set({
          classification: { confidence, labelId, threshold: SUGGEST_THRESHOLD },
          outcome: { status: "suggested", suggestion: "apply_label" },
        });

        return {
          data: { confidence, labelId },
          success: true,
          threadId,
        };
      } catch (error) {
        status = 500;
        requestLog.error(error instanceof Error ? error : String(error), {
          retryable: isRetryableError(error),
          step: "label_classifier",
        });
        requestLog.set({ outcome: { status: "failed" } });
        return {
          error: error instanceof Error ? error.message : String(error),
          success: false,
          threadId,
        };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
