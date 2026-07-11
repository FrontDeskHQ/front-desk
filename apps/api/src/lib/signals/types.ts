import type { ServerDB } from "@live-state/sync/server";
import type { Action, ActionKind } from "@workspace/schemas/signals";
import type { schema } from "../../live-state/schema";

export type SignalExecutionDb = Pick<
  ServerDB<typeof schema>,
  | "thread"
  | "message"
  | "author"
  | "threadLabel"
  | "label"
  | "autonomousAction"
  | "insert"
  | "transaction"
  // `find` backs capability dispatch: resolving a linked/mirrored external
  // entity's owning integration (issue-state sync, PR link).
  | "find"
>;

export type ExecutionContext = {
  threadId: string;
  organizationId: string;
  /** Human accept; null for autonomous execution. */
  actorUserId: string | null;
  actorUserName: string | null;
  db: SignalExecutionDb;
};

export type ActionHandler<A extends Action = Action> = {
  apply: (action: A, ctx: ExecutionContext) => Promise<void>;
  compensate?: (action: A, ctx: ExecutionContext) => Promise<void>;
};

/** Runtime registry keyed by action kind (call sites pass a narrowed `Action`). */
export type ActionHandlerRegistry = Record<ActionKind, ActionHandler>;

export type ExecutionResult = {
  succeeded: Action[];
  failed: { action: Action; error: unknown } | null;
  rolledBack: Action[];
};
