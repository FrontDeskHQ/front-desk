import type { ServerDB } from "@live-state/sync/server";
import type { DefaultIssueTarget } from "@workspace/schemas/organization";
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
  // entity's owning integration (issue-state sync, PR link), and reading the
  // org's default issue target.
  | "find"
>;

export interface ExecutionContext {
  threadId: string;
  organizationId: string;
  /** Human accept; null for autonomous execution. */
  actorUserId: string | null;
  actorUserName: string | null;
  db: SignalExecutionDb;
  /**
   * Where `create_issue` should file, overriding the org's default issue
   * target. Set only on the human accept path, where the card prefills the
   * default with a picker so a reviewer can redirect before accepting. Absent
   * for autonomous execution, which always uses the deterministic default.
   */
  issueTarget?: DefaultIssueTarget;
}

export interface ActionHandler<A extends Action = Action> {
  apply: (action: A, ctx: ExecutionContext) => Promise<void>;
  compensate?: (action: A, ctx: ExecutionContext) => Promise<void>;
}

/** Runtime registry keyed by action kind (call sites pass a narrowed `Action`). */
export type ActionHandlerRegistry = Record<ActionKind, ActionHandler>;

export interface ExecutionResult {
  succeeded: Action[];
  failed: { action: Action; error: unknown } | null;
  rolledBack: Action[];
}
