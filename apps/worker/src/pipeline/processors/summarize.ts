import { createHash } from "node:crypto";

import type { InferLiveObject } from "@live-state/sync";
import { createAILogger, createLogger } from "@workspace/utils/logging";
import { generateText, Output } from "ai";
import type { schema } from "api/schema";
import z from "zod";

import { AI_PRICING } from "../../lib/ai-pricing";
import { isRetryableError } from "../../lib/logging";
import type { WorkerLogger } from "../../lib/logging";
import { generationModel } from "../../lib/respan";
import type { ParsedSummary } from "../../types";
import type { AgentRunAudit } from "../core/agent-run-audit";
import { serializeObservableModelStep } from "../core/model-audit";
import { hasSynthesisTrigger } from "../core/trigger-policy";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";

export interface SummarizeOutput {
  summary: ParsedSummary;
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("overloaded") ||
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("quota") ||
      message.includes("429")
    );
  }
  return false;
};

const getRetryDelay = (attempt: number, isRateLimit: boolean): number => {
  const baseDelay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
  const delay = isRateLimit ? baseDelay * 2 : baseDelay;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
};

export const summarySchema = z.object({
  entities: z
    .array(z.string())
    .describe(
      "Technical components, features, systems, or products directly involved. Not actions or descriptions."
    ),
  expectedAction: z
    .string()
    .describe(
      "The category of resolution needed (e.g., 'configuration guidance', 'bug fix', 'feature explanation', 'documentation')."
    ),
  keywords: z
    .array(z.string())
    .max(7)
    .describe(
      "Canonical terms that identify the problem category. Use normalized vocabulary. Max 5-7 terms that would match similar issues."
    ),
  shortDescription: z
    .string()
    .describe(
      "The distilled core problem with only essential context. 2-3 sentences. Avoid circumstantial details."
    ),
  title: z
    .string()
    .describe(
      "A normalized, canonical problem statement. Should match semantically similar issues regardless of original wording. No ticket-style prefixes."
    ),
});

export const summarizeThread = async (
  thread: InferLiveObject<
    typeof schema.thread,
    { messages: true; labels: { include: { label: true } } }
  >,
  ai?: ReturnType<typeof createAILogger>,
  requestLog?: WorkerLogger,
  audit?: AgentRunAudit
): Promise<ParsedSummary> => {
  requestLog?.set({
    input: {
      messageCount: thread.messages?.length ?? 0,
      labelCount: thread.labels?.length ?? 0,
      hasTitle: Boolean(thread.name),
    },
  });
  const firstMessage = thread.messages?.toSorted((a, b) =>
    a.id.localeCompare(b.id)
  )[0];
  const activeLabels = thread.labels
    ?.filter((l) => l.label?.enabled)
    .map((l) => l.label?.name)
    .join(", ");

  const prompt = `
You are a support thread analyzer optimized for semantic similarity matching. Your goal is to extract the CORE INTENT and UNDERLYING PROBLEM from a support thread, ignoring surface-level noise.

## Thread Data
**Title:**
${thread.name ?? "No title available."}

**First Message:**
${firstMessage?.content ?? "No message content available."}

**Applied Labels:**
${activeLabels || "None"}

---

## Instructions

Analyze this thread to identify what the user ACTUALLY needs, not just what they literally said. Focus on:

1. **Core Problem Identification**: What is the fundamental issue? Strip away:
   - Emotional language ("frustrated", "urgent", "desperately need")
   - Circumstantial details that don't define the problem
   - User's attempted solutions (focus on what they're trying to achieve)
   - Politeness phrases or greetings

2. **Semantic Normalization**: Use consistent, canonical terminology:
   - Prefer generic terms over brand-specific when the brand isn't essential
   - Use standard technical vocabulary (e.g., "authentication" not "logging in stuff")
   - Normalize synonyms (choose ONE term: "crash" vs "freeze" vs "hang" → pick the most accurate)

3. **Intent Classification**: Identify the underlying user goal:
   - Is this a "how to" question disguised as a bug report?
   - Is this a feature request framed as a complaint?
   - Is this a configuration issue presented as a bug?

4. **Avoid These Traps**:
   - Don't include the user's proposed solution as the problem
   - Don't add keywords for every noun mentioned
   - Don't describe the thread itself (e.g., "user reports issue")
   - Don't include time-sensitive or instance-specific details

## Output Guidelines

- **title**: A normalized, searchable problem statement (not a ticket title)
- **shortDescription**: The distilled problem + context needed to understand it
- **keywords**: Only terms that would help find SIMILAR problems (max 5-7)
- **entities**: Technical components, features, or systems involved (not actions)
- **expectedAction**: The type of resolution needed (e.g., "configuration guidance", "bug fix", "documentation clarification")

Think: "If another user has the exact same underlying problem with different wording, would this summary match theirs?"
  `;

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let modelStartedAt: number | undefined;
    try {
      const baseModel = generationModel();
      audit?.record(
        "model.requested",
        {
          attempt: attempt + 1,
          input: {
            appliedLabels: activeLabels || null,
            firstMessage: firstMessage?.content ?? null,
            threadName: thread.name ?? null,
          },
          model: {
            modelId: baseModel.modelId,
            provider: baseModel.provider,
          },
          outputSchema: z.toJSONSchema(summarySchema),
          prompt,
        },
        { phase: "summarize", stepIndex: attempt }
      );

      modelStartedAt = performance.now();
      const result = await generateText({
        model: ai ? ai.wrap(baseModel) : baseModel,
        onStepFinish: (step) => {
          audit?.record("model.step", serializeObservableModelStep(step), {
            phase: "summarize",
            stepIndex: attempt,
          });
        },
        output: Output.object({ schema: summarySchema }),
        prompt,
      });

      audit?.record(
        "model.completed",
        {
          attempt: attempt + 1,
          output: result.output,
          text: result.text,
          totalUsage: result.totalUsage,
          durationMs: performance.now() - modelStartedAt,
        },
        { phase: "summarize", stepIndex: attempt }
      );

      requestLog?.set({
        output: {
          entityCount: result.output.entities.length,
          keywordCount: result.output.keywords.length,
          hasTitle: result.output.title.trim().length > 0,
        },
      });
      return {
        entities: result.output.entities,
        expectedAction: result.output.expectedAction,
        keywords: result.output.keywords,
        shortDescription: result.output.shortDescription,
        title: result.output.title,
      };
    } catch (error) {
      lastError = error;
      if (modelStartedAt !== undefined) {
        audit?.record(
          "model.failed",
          {
            attempt: attempt + 1,
            durationMs: performance.now() - modelStartedAt,
            error,
            status: "failed",
          },
          { phase: "summarize", stepIndex: attempt }
        );
      }
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      const isRetryable = isRetryableError(error);
      const isRateLimit = isRateLimitError(error);

      if (!isRetryable) {
        throw error;
      }

      if (isLastAttempt) {
        throw error;
      }

      const delay = getRetryDelay(attempt, isRateLimit);
      const errorType = isRateLimit ? "rate limit" : "retryable";
      requestLog?.warn("Summary generation attempt failed; retrying", {
        retry: {
          attempt: attempt + 1,
          maxAttempts: MAX_RETRIES,
          delayMs: delay,
          errorType,
          rateLimited: isRateLimit,
        },
      });

      await sleep(delay);
    }
  }

  throw lastError || new Error("Failed to summarize thread");
};

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

export const summarizeProcessor: ProcessorDefinition<SummarizeOutput> = {
  computeHash(context: ProcessorExecuteContext): string {
    const { thread } = context;

    const firstMessage = thread.messages?.toSorted((a, b) =>
      a.id.localeCompare(b.id)
    )[0];

    const labelNames = thread.labels
      ?.filter((l) => l.label?.enabled)
      .map((l) => l.label?.name)
      .filter(Boolean)
      .toSorted()
      .join(",");

    const hashInput = [
      thread.name || "",
      firstMessage?.content || "",
      labelNames || "",
    ].join("|");

    return computeSha256(hashInput);
  },

  dependencies: [],

  runsOnTrigger(context: ProcessorExecuteContext): boolean {
    return hasSynthesisTrigger(context.context.input.triggers);
  },

  async execute(
    context: ProcessorExecuteContext
  ): Promise<ProcessorResult<SummarizeOutput>> {
    const { thread, threadId } = context;
    const requestLog = createLogger({
      action: "pipeline.summarize",
      processor: "summarize",
      threadId,
      organizationId: thread.organizationId,
      jobId: context.context.jobId,
    });
    const ai = createAILogger(requestLog, { cost: AI_PRICING });
    let status = 200;

    try {
      const summary = await summarizeThread(
        thread,
        ai,
        requestLog,
        context.run.audit
      );

      if (!summary || !summary.title || summary.title.trim().length === 0) {
        status = 500;
        requestLog.set({
          outcome: { status: "failed", reason: "empty_summary" },
        });
        return {
          threadId,
          success: false,
          error: "Failed to generate summary: empty result",
        };
      }

      requestLog.set({ outcome: { status: "completed" } });
      return {
        threadId,
        success: true,
        data: { summary },
      };
    } catch (error) {
      status = 500;
      requestLog.error(error instanceof Error ? error : String(error), {
        retryable: isRetryableError(error),
        step: "summarize",
      });
      requestLog.set({ outcome: { status: "failed" } });
      return {
        threadId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      requestLog.emit({ status });
    }
  },

  getIdempotencyKey(threadId: string): string {
    return `summarize:${threadId}`;
  },

  name: "summarize",
};
