import {
  type Action,
  fingerprintAgentRead,
  nextAgentReadAfterExecution,
  type ThreadRead,
} from "@workspace/schemas/signals";

export { nextAgentReadAfterExecution };

export type ReadSelection =
  | "primary"
  | {
      alternativeIndex: number;
    };

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
