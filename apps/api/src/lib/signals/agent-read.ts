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
    }
  | {
      /** Indices into `read.primary` the human kept selected in the bundle. */
      primaryActionIndices: number[];
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
  } else if ("alternativeIndex" in selection) {
    const alternative = read.alternatives?.[selection.alternativeIndex];
    if (!alternative) {
      throw new Error("INVALID_SELECTION");
    }
    bundle = [alternative];
  } else {
    if (selection.primaryActionIndices.length === 0) {
      throw new Error("INVALID_SELECTION");
    }
    bundle = selection.primaryActionIndices.map((index) => {
      const action = read.primary[index];
      if (!action) {
        throw new Error("INVALID_SELECTION");
      }
      return action;
    });
  }

  return bundle.map((action) => {
    if (action.kind !== "reply") return action;
    return {
      ...action,
      draftMarkdown: replyDraft ?? action.draftMarkdown,
    };
  });
};
