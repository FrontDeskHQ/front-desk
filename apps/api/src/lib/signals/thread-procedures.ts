import type { ServerDB } from "@live-state/sync/server";
import {
  actionSchema,
  duplicateHintSlotSchema,
  inlineSuggestionSchema,
  relatedDocsHintSlotSchema,
  relatedPrsHintSlotSchema,
} from "@workspace/schemas/signals";
import type { InlineSuggestion, ThreadRead } from "@workspace/schemas/signals";
import { z } from "zod";

import { schema } from "../../live-state/schema";
import type { AuthorizeReq } from "../authorize";
import { authorize, getWorkspaceActor } from "../authorize";
import {
  assertReadFingerprint,
  deselectedPrimaryActions,
  nextAgentReadAfterExecution,
  resolveBundleFromSelection,
} from "./agent-read";
import type { ReadSelection } from "./agent-read";
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
  actions: z.array(actionSchema),
  organizationId: z.string(),
  threadId: z.string(),
});

export const acceptReadInputSchema = z.object({
  organizationId: z.string(),
  readFingerprint: z.string(),
  replyDraft: z.string().optional(),
  selection: readSelectionSchema,
  threadId: z.string(),
});

export const dismissReadInputSchema = z.object({
  organizationId: z.string(),
  readFingerprint: z.string(),
  threadId: z.string(),
});

export const acceptInlineSuggestionInputSchema = z.object({
  organizationId: z.string(),
  suggestionId: z.string(),
  threadId: z.string(),
});

export const dismissInlineSuggestionInputSchema = z.object({
  organizationId: z.string(),
  suggestionId: z.string(),
  threadId: z.string(),
});

const loadThread = async (
  db: Pick<ServerDB<typeof schema>, "thread">,
  threadId: string,
  organizationId: string
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
  }
): ExecutionContext => ({
  actorUserId: args.actorUserId,
  actorUserName: args.actorUserName,
  db,
  organizationId: args.organizationId,
  threadId: args.threadId,
});

const persistAgentRead = async (
  db: SignalExecutionDb,
  threadId: string,
  agentRead: ThreadRead | null
): Promise<void> => {
  await db.thread.update(threadId, { agentRead });
};

const removeInlineSuggestion = (
  suggestions: InlineSuggestion[],
  suggestionId: string
): InlineSuggestion[] =>
  suggestions.filter((suggestion) => suggestion.id !== suggestionId);

// Atomically drops a suggestion from thread.inlineSuggestions. The read-filter-
// write runs inside a single transaction so concurrent accepts/dismisses (a
// batch loop, or another tab) can't each read the same array and clobber one
// another's removals — the client-side serialization is only a courtesy on top
// of this. Returns whether the suggestion was present.
const removeInlineSuggestionAtomically = async (
  db: TransactionalDb,
  args: { threadId: string; organizationId: string; suggestionId: string }
): Promise<boolean> => {
  let existed = false;
  await db.transaction(async ({ trx }) => {
    const thread = await trx.findOne(schema.thread, args.threadId);
    if (!thread || thread.organizationId !== args.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }
    const current = thread.inlineSuggestions ?? [];
    existed = current.some((s) => s.id === args.suggestionId);
    if (existed) {
      await trx.update(schema.thread, args.threadId, {
        inlineSuggestions: removeInlineSuggestion(current, args.suggestionId),
      });
    }
  });
  return existed;
};

export const runExecuteAutonomousBundle = async (
  db: SignalExecutionDb,
  input: z.infer<typeof executeAutonomousBundleInputSchema>
): Promise<ExecutionResult> => {
  await loadThread(db, input.threadId, input.organizationId);

  const registry = createActionHandlerRegistry();
  const ctx = buildExecutionContext(db, {
    actorUserId: null,
    actorUserName: null,
    organizationId: input.organizationId,
    threadId: input.threadId,
  });

  const result = await executeBundle(input.actions, registry, ctx);
  await recordAutonomousReceipts(ctx, result.succeeded);
  return result;
};

export const runAcceptRead = async (
  req: AuthorizeReq,
  db: SignalExecutionDb,
  input: z.infer<typeof acceptReadInputSchema>
): Promise<ExecutionResult> => {
  authorize(req, { organizationId: input.organizationId });

  const { userId: actorUserId, userName: actorUserName } =
    getWorkspaceActor(req);

  const thread = await loadThread(db, input.threadId, input.organizationId);
  if (!thread.agentRead) {
    throw new Error("NO_AGENT_READ");
  }

  assertReadFingerprint(thread.agentRead, input.readFingerprint);

  const selection = input.selection as ReadSelection;
  const bundle = resolveBundleFromSelection(
    thread.agentRead,
    selection,
    input.replyDraft
  );

  const registry = createActionHandlerRegistry();
  const ctx = buildExecutionContext(db, {
    actorUserId,
    actorUserName,
    organizationId: input.organizationId,
    threadId: input.threadId,
  });

  const result = await executeBundle(bundle, registry, ctx);
  let nextRead = nextAgentReadAfterExecution(thread.agentRead, result);

  // A successful subset selection only consumes the chosen primary actions;
  // preserve the ones the human deselected instead of clearing the read with
  // them. (Partial failures already retain the unconsumed primary entries.)
  if (!result.failed) {
    const deselected = deselectedPrimaryActions(thread.agentRead, selection);
    if (deselected.length > 0) {
      nextRead = { ...thread.agentRead, primary: deselected };
    }
  }

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
  input: z.infer<typeof dismissReadInputSchema>
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
  req: AuthorizeReq,
  db: SignalExecutionDb,
  input: z.infer<typeof acceptInlineSuggestionInputSchema>
): Promise<ExecutionResult> => {
  authorize(req, { organizationId: input.organizationId });

  const { userId: actorUserId, userName: actorUserName } =
    getWorkspaceActor(req);

  const thread = await loadThread(db, input.threadId, input.organizationId);
  const suggestions = thread.inlineSuggestions ?? [];
  const suggestion = suggestions.find((s) => s.id === input.suggestionId);
  if (!suggestion) {
    throw new Error("INLINE_SUGGESTION_NOT_FOUND");
  }

  const registry = createActionHandlerRegistry();
  const ctx = buildExecutionContext(db, {
    actorUserId,
    actorUserName,
    organizationId: input.organizationId,
    threadId: input.threadId,
  });

  const result = await executeBundle([suggestion.action], registry, ctx);

  if (!result.failed) {
    await removeInlineSuggestionAtomically(db, {
      organizationId: input.organizationId,
      suggestionId: suggestion.id,
      threadId: input.threadId,
    });
  }

  return result;
};

export const runDismissInlineSuggestion = async (
  req: AuthorizeReq,
  db: SignalExecutionDb,
  input: z.infer<typeof dismissInlineSuggestionInputSchema>
): Promise<{ dismissed: true }> => {
  authorize(req, { organizationId: input.organizationId });

  const existed = await removeInlineSuggestionAtomically(db, {
    organizationId: input.organizationId,
    suggestionId: input.suggestionId,
    threadId: input.threadId,
  });
  if (!existed) {
    throw new Error("INLINE_SUGGESTION_NOT_FOUND");
  }

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
  organizationId: z.string(),
  suggestion: inlineSuggestionSchema,
  threadId: z.string(),
});

export const runUpsertInlineSuggestion = async (
  db: TransactionalDb,
  input: z.infer<typeof upsertInlineSuggestionInputSchema>
): Promise<{ upserted: true }> => {
  await db.transaction(async ({ trx }) => {
    const thread = await trx.findOne(schema.thread, input.threadId);
    if (!thread || thread.organizationId !== input.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const current = thread.inlineSuggestions ?? [];
    const idx = current.findIndex((s) => s.id === input.suggestion.id);
    const next =
      idx === -1
        ? [...current, input.suggestion]
        : current.map((s, i) => (i === idx ? input.suggestion : s));

    await trx.update(schema.thread, input.threadId, {
      inlineSuggestions: next,
    });
  });

  return { upserted: true };
};

export const writeHintSlotInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("duplicate"),
    organizationId: z.string(),
    slot: duplicateHintSlotSchema,
    threadId: z.string(),
  }),
  z.object({
    kind: z.literal("related_docs"),
    organizationId: z.string(),
    slot: relatedDocsHintSlotSchema,
    threadId: z.string(),
  }),
  z.object({
    kind: z.literal("related_prs"),
    organizationId: z.string(),
    slot: relatedPrsHintSlotSchema,
    threadId: z.string(),
  }),
]);

export const runWriteHintSlot = async (
  db: TransactionalDb,
  input: z.infer<typeof writeHintSlotInputSchema>
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
