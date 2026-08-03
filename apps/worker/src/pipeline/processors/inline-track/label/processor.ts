import { createHash } from "node:crypto";

import { createAILogger, createLogger } from "@workspace/utils/logging";

import { AI_PRICING } from "../../../../lib/ai-pricing";
import { getLabelAutonomyMode } from "../../../../lib/autonomy";
import { fetchClient } from "../../../../lib/database/client";
import { appendOrReplaceInlineSuggestion } from "../../../../lib/inline-suggestions";
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
// Reserved for auto-mode silent-apply (gated by issue 04). Currently unused;
// auto behaves like suggest until the action executor lands.
const _AUTO_THRESHOLD = 0.85;

interface LabelRow {
  id: string;
  name: string;
  organizationId: string;
}

export interface LabelClassifierOutput {
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
      const { thread, threadId } = context;
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
        const autonomy = await getLabelAutonomyMode(thread.organizationId);
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

        const orgLabels = (await fetchClient.query.label.forOrg({
          enabled: true,
          organizationId: thread.organizationId,
        })) as LabelRow[];

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

        // TODO(issue-04): When the action executor lands, branch on `autonomy`:
        //   autonomy === "auto" && confidence >= AUTO_THRESHOLD
        //     → executeBundle([{kind:"apply_label", labelId}], handlers, ctx)
        //       and write the autonomousAction receipt; do not emit a suggestion.
        // Until then, both "suggest" and "auto" emit an inline suggestion.
        await appendOrReplaceInlineSuggestion(threadId, thread.organizationId, {
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
