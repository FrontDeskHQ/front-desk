import { createHash } from "node:crypto";
import { createAILogger, createLogger } from "@workspace/utils/logging";
import { AI_PRICING } from "../../../../lib/ai-pricing";
import { getLabelAutonomyMode } from "../../../../lib/autonomy";
import { fetchClient } from "../../../../lib/database/client";
import { appendOrReplaceInlineSuggestion } from "../../../../lib/inline-suggestions";
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
// biome-ignore lint/correctness/noUnusedVariables: kept for issue 04 wire-up.
const AUTO_THRESHOLD = 0.85;

type LabelRow = { id: string; name: string; organizationId: string };

export type LabelClassifierOutput = {
  skipped?:
    | "autonomy_off"
    | "no_labels"
    | "below_threshold"
    | "already_applied";
  labelId?: string;
  confidence?: number;
};

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
      context: ProcessorExecuteContext,
    ): Promise<ProcessorResult<LabelClassifierOutput>> {
      const { thread, threadId } = context;
      const requestLog = createLogger({
        action: "pipeline.label_classifier",
        processor: "label_classifier",
        threadId,
        organizationId: thread.organizationId,
        jobId: context.context.jobId,
      });
      const ai = createAILogger(requestLog, { cost: AI_PRICING });
      let status = 200;

      try {
        const autonomy = await getLabelAutonomyMode(thread.organizationId);
        if (autonomy === "off") {
          return {
            threadId,
            success: true,
            data: { skipped: "autonomy_off" },
          };
        }

        const orgLabels = (await fetchClient.query.label
          .where({ organizationId: thread.organizationId, enabled: true })
          .get()) as LabelRow[];

        if (orgLabels.length === 0) {
          return {
            threadId,
            success: true,
            data: { skipped: "no_labels" },
          };
        }

        const appliedLabelIds = new Set(
          (thread.labels ?? [])
            .filter((tl) => tl.enabled && tl.label?.enabled)
            .map((tl) => tl.labelId)
            .filter((id): id is string => Boolean(id)),
        );

        const firstMessage = thread.messages?.sort((a, b) =>
          a.id.localeCompare(b.id),
        )[0];

        const summarizeOutput =
          context.context.getProcessorOutput<SummarizeOutput>(
            "summarize",
            threadId,
          );

        const { labelId, confidence } = await classifyLabel(
          {
            threadName: thread.name ?? null,
            firstMessageContent: firstMessage?.content ?? null,
            summary: summarizeOutput?.summary ?? null,
            orgLabels: orgLabels.map((l) => ({ id: l.id, name: l.name })),
          },
          ai,
        );

        if (!labelId || confidence < SUGGEST_THRESHOLD) {
          return {
            threadId,
            success: true,
            data: {
              skipped: "below_threshold",
              labelId: undefined,
              confidence,
            },
          };
        }

        if (appliedLabelIds.has(labelId)) {
          return {
            threadId,
            success: true,
            data: { skipped: "already_applied", labelId, confidence },
          };
        }

        // TODO(issue-04): When the action executor lands, branch on `autonomy`:
        //   autonomy === "auto" && confidence >= AUTO_THRESHOLD
        //     → executeBundle([{kind:"apply_label", labelId}], handlers, ctx)
        //       and write the autonomousAction receipt; do not emit a suggestion.
        // Until then, both "suggest" and "auto" emit an inline suggestion.
        await appendOrReplaceInlineSuggestion(threadId, thread.organizationId, {
          id: `label:${threadId}`,
          action: { kind: "apply_label", labelId },
          confidence,
          generator: "label_classifier",
          createdAt: new Date().toISOString(),
        });

        return {
          threadId,
          success: true,
          data: { labelId, confidence },
        };
      } catch (error) {
        status = 500;
        console.error(`Label classifier failed for thread ${threadId}:`, error);
        requestLog.error(
          `Label classifier failed for thread ${threadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return {
          threadId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        requestLog.emit({ status });
      }
    },
  };
