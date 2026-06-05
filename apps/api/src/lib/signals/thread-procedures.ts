import type { ServerDB } from "@live-state/sync/server";
import {
  actionSchema,
  duplicateHintSlotSchema,
  type InlineSuggestion,
  inlineSuggestionSchema,
  relatedDocsHintSlotSchema,
  type ThreadRead,
} from "@workspace/schemas/signals";
import { z } from "zod";
import { schema } from "../../live-state/schema";
import type { AuthorizeReq } from "../authorize";
import { authorize } from "../authorize";
import {
  assertReadFingerprint,
  nextAgentReadAfterExecution,
  type ReadSelection,
  resolveBundleFromSelection,
} from "./agent-read";
import { recordAutonomousReceipts } from "./autonomous-receipts";
import { executeBundle } from "./execute-bundle";
import { createActionHandlerRegistry } from "./handlers/registry";
import type {
  ExecutionContext,
  ExecutionResult,
  SignalExecutionDb,
} from "./types";

const readSelectionSchema = z.union([
  z.literal("primary"),
  z.object({ alternativeIndex: z.number().int().min(0) }),
  z.object({
    primaryActionIndices: z.array(z.number().int().min(0)).min(1),
  }),
]);

export const executeAutonomousBundleInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  actions: z.array(actionSchema),
});

export const acceptReadInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  selection: readSelectionSchema,
  readFingerprint: z.string(),
  replyDraft: z.string().optional(),
});

export const dismissReadInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  readFingerprint: z.string(),
});

export const acceptInlineSuggestionInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  suggestionId: z.string(),
});

export const dismissInlineSuggestionInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  suggestionId: z.string(),
});

const loadThread = async (
  db: Pick<ServerDB<typeof schema>, "thread">,
  threadId: string,
  organizationId: string,
) => {
  const thread = await db.thread.one(threadId).get();
  if (!thread || thread.organizationId !== organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }
  return thread;
};

const buildExecutionContext = (
  db: SignalExecutionDb,
  args: {
    threadId: string;
    organizationId: string;
    actorUserId: string | null;
    actorUserName: string | null;
  },
): ExecutionContext => ({
  threadId: args.threadId,
  organizationId: args.organizationId,
  actorUserId: args.actorUserId,
  actorUserName: args.actorUserName,
  db,
});

const persistAgentRead = async (
  db: SignalExecutionDb,
  threadId: string,
  agentRead: ThreadRead | null,
): Promise<void> => {
  await db.thread.update(threadId, { agentRead });
};

const removeInlineSuggestion = (
  suggestions: InlineSuggestion[],
  suggestionId: string,
): InlineSuggestion[] =>
  suggestions.filter((suggestion) => suggestion.id !== suggestionId);

export const runExecuteAutonomousBundle = async (
  db: SignalExecutionDb,
  input: z.infer<typeof executeAutonomousBundleInputSchema>,
): Promise<ExecutionResult> => {
  await loadThread(db, input.threadId, input.organizationId);

  const registry = createActionHandlerRegistry();
  const ctx = buildExecutionContext(db, {
    threadId: input.threadId,
    organizationId: input.organizationId,
    actorUserId: null,
    actorUserName: null,
  });

  const result = await executeBundle(input.actions, registry, ctx);
  await recordAutonomousReceipts(ctx, result.succeeded);
  return result;
};

export const runAcceptRead = async (
  req: AuthorizeReq & {
    context?: {
      session?: { userId: string };
      user?: { name: string };
    };
  },
  db: SignalExecutionDb,
  input: z.infer<typeof acceptReadInputSchema>,
): Promise<ExecutionResult> => {
  authorize(req, { organizationId: input.organizationId });

  const actorUserId = req.context?.session?.userId ?? null;
  if (!actorUserId) {
    throw new Error("UNAUTHORIZED");
  }

  const thread = await loadThread(db, input.threadId, input.organizationId);
  if (!thread.agentRead) {
    throw new Error("NO_AGENT_READ");
  }

  assertReadFingerprint(thread.agentRead, input.readFingerprint);

  const bundle = resolveBundleFromSelection(
    thread.agentRead,
    input.selection as ReadSelection,
    input.replyDraft,
  );

  const registry = createActionHandlerRegistry();
  const ctx = buildExecutionContext(db, {
    threadId: input.threadId,
    organizationId: input.organizationId,
    actorUserId,
    actorUserName: req.context?.user?.name ?? null,
  });

  const result = await executeBundle(bundle, registry, ctx);
  const nextRead = nextAgentReadAfterExecution(thread.agentRead, result);
  await persistAgentRead(db, input.threadId, nextRead);

  if (result.failed) {
    const message =
      result.failed.error instanceof Error
        ? result.failed.error.message
        : String(result.failed.error);
    throw new Error(`ACTION_FAILED:${result.failed.action.kind}:${message}`);
  }

  return result;
};

export const runDismissRead = async (
  req: AuthorizeReq,
  db: SignalExecutionDb,
  input: z.infer<typeof dismissReadInputSchema>,
): Promise<{ cleared: true }> => {
  authorize(req, { organizationId: input.organizationId });

  const thread = await loadThread(db, input.threadId, input.organizationId);
  if (!thread.agentRead) {
    return { cleared: true };
  }

  assertReadFingerprint(thread.agentRead, input.readFingerprint);
  await persistAgentRead(db, input.threadId, null);
  return { cleared: true };
};

export const runAcceptInlineSuggestion = async (
  req: AuthorizeReq & {
    context?: {
      session?: { userId: string };
      user?: { name: string };
    };
  },
  db: SignalExecutionDb,
  input: z.infer<typeof acceptInlineSuggestionInputSchema>,
): Promise<ExecutionResult> => {
  authorize(req, { organizationId: input.organizationId });

  const actorUserId = req.context?.session?.userId ?? null;
  if (!actorUserId) {
    throw new Error("UNAUTHORIZED");
  }

  const thread = await loadThread(db, input.threadId, input.organizationId);
  const suggestions = thread.inlineSuggestions ?? [];
  const suggestion = suggestions.find((s) => s.id === input.suggestionId);
  if (!suggestion) {
    throw new Error("INLINE_SUGGESTION_NOT_FOUND");
  }

  const registry = createActionHandlerRegistry();
  const ctx = buildExecutionContext(db, {
    threadId: input.threadId,
    organizationId: input.organizationId,
    actorUserId,
    actorUserName: req.context?.user?.name ?? null,
  });

  const result = await executeBundle([suggestion.action], registry, ctx);

  if (!result.failed) {
    await db.thread.update(input.threadId, {
      inlineSuggestions: removeInlineSuggestion(suggestions, suggestion.id),
    });
  }

  return result;
};

export const runDismissInlineSuggestion = async (
  req: AuthorizeReq,
  db: SignalExecutionDb,
  input: z.infer<typeof dismissInlineSuggestionInputSchema>,
): Promise<{ dismissed: true }> => {
  authorize(req, { organizationId: input.organizationId });

  const thread = await loadThread(db, input.threadId, input.organizationId);
  const suggestions = thread.inlineSuggestions ?? [];
  const suggestion = suggestions.find((s) => s.id === input.suggestionId);
  if (!suggestion) {
    throw new Error("INLINE_SUGGESTION_NOT_FOUND");
  }

  await db.thread.update(input.threadId, {
    inlineSuggestions: removeInlineSuggestion(suggestions, suggestion.id),
  });

  return { dismissed: true };
};

// --- Worker write-back procedures -----------------------------------------
//
// Inline-track and synthesis-track processors that share a thread run in the
// same parallel pipeline turn, so two of them can read-modify-write the same
// JSON column (`inlineSuggestions` / `hints`) concurrently. Doing the
// read-modify-write here, inside a single `db.transaction`, keeps the read
// immediately adjacent to the write in one round trip instead of two HTTP hops
// from the worker — shrinking the lost-update window to the transaction body.
// (Fully eliminating it would need a DB-side JSON merge or row lock.)

type TransactionalDb = Pick<ServerDB<typeof schema>, "transaction">;

export const upsertInlineSuggestionInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  suggestion: inlineSuggestionSchema,
});

export const runUpsertInlineSuggestion = async (
  db: TransactionalDb,
  input: z.infer<typeof upsertInlineSuggestionInputSchema>,
): Promise<{ upserted: true }> => {
  await db.transaction(async ({ trx }) => {
    const thread = await trx.findOne(schema.thread, input.threadId);
    if (!thread || thread.organizationId !== input.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const current = thread.inlineSuggestions ?? [];
    const idx = current.findIndex((s) => s.id === input.suggestion.id);
    const next =
      idx >= 0
        ? current.map((s, i) => (i === idx ? input.suggestion : s))
        : [...current, input.suggestion];

    await trx.update(schema.thread, input.threadId, {
      inlineSuggestions: next,
    });
  });

  return { upserted: true };
};

export const writeHintSlotInputSchema = z.discriminatedUnion("kind", [
  z.object({
    threadId: z.string(),
    organizationId: z.string(),
    kind: z.literal("duplicate"),
    slot: duplicateHintSlotSchema,
  }),
  z.object({
    threadId: z.string(),
    organizationId: z.string(),
    kind: z.literal("related_docs"),
    slot: relatedDocsHintSlotSchema,
  }),
]);

export const runWriteHintSlot = async (
  db: TransactionalDb,
  input: z.infer<typeof writeHintSlotInputSchema>,
): Promise<{ written: true }> => {
  await db.transaction(async ({ trx }) => {
    const thread = await trx.findOne(schema.thread, input.threadId);
    if (!thread || thread.organizationId !== input.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const current = thread.hints ?? {};
    await trx.update(schema.thread, input.threadId, {
      hints: { ...current, [input.kind]: input.slot },
    });
  });

  return { written: true };
};
