import {
  type Action,
  type ThreadRead,
  fingerprintAgentRead,
} from "@workspace/schemas/signals";
import type { ExecutionResult } from "./types";

export type ReadSelection =
  | "primary"
  | {
      alternativeIndex: number;
    };

const actionsEqual = (a: Action, b: Action): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export const assertReadFingerprint = (
  read: ThreadRead,
  readFingerprint: string,
): void => {
  if (fingerprintAgentRead(read) !== readFingerprint) {
    throw new Error("STALE_AGENT_READ");
  }
};

export const resolveBundleFromSelection = (
  read: ThreadRead,
  selection: ReadSelection,
  replyDraft?: string,
): Action[] => {
  let bundle: Action[];

  if (selection === "primary") {
    bundle = [...read.primary];
  } else {
    const alternative = read.alternatives?.[selection.alternativeIndex];
    if (!alternative) {
      throw new Error("INVALID_SELECTION");
    }
    bundle = [alternative];
  }

  return bundle.map((action) => {
    if (action.kind !== "reply") return action;
    return {
      ...action,
      draftMarkdown: replyDraft ?? action.draftMarkdown,
    };
  });
};

export const nextAgentReadAfterExecution = (
  read: ThreadRead,
  result: ExecutionResult,
): ThreadRead | null => {
  if (!result.failed) {
    return null;
  }

  if (result.rolledBack.length > 0 && result.succeeded.length === 0) {
    return read;
  }

  const remainingPrimary = read.primary.filter(
    (action) =>
      !result.succeeded.some((succeeded) => actionsEqual(succeeded, action)),
  );

  if (remainingPrimary.length === 0) {
    return null;
  }

  return {
    ...read,
    primary: remainingPrimary,
  };
};
