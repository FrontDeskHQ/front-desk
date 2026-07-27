import {
  fingerprintAgentRead,
  nextAgentReadAfterExecution,
} from "@workspace/schemas/signals";
import type { Action, ThreadRead } from "@workspace/schemas/signals";

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
  readFingerprint: string
): void => {
  if (fingerprintAgentRead(read) !== readFingerprint) {
    throw new Error("STALE_AGENT_READ");
  }
};

export const resolveBundleFromSelection = (
  read: ThreadRead,
  selection: ReadSelection,
  replyDraft?: string
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
    // Normalize so duplicate or reordered indices can't replay or reorder a
    // primary action's side effects.
    const normalizedIndices = [
      ...new Set(selection.primaryActionIndices),
    ].toSorted((a, b) => a - b);
    bundle = normalizedIndices.map((index) => {
      const action = read.primary[index];
      if (!action) {
        throw new Error("INVALID_SELECTION");
      }
      return action;
    });
  }

  return bundle.map((action) => {
    if (action.kind !== "reply") {
      return action;
    }
    return {
      ...action,
      draftMarkdown: replyDraft ?? action.draftMarkdown,
    };
  });
};

/**
 * Primary actions the human left unselected in a subset bundle. These must
 * survive a fully-successful execution of the selected subset rather than being
 * cleared along with the rest of the read. Empty for full-primary or
 * alternative selections, where no primary action is intentionally retained.
 */
export const deselectedPrimaryActions = (
  read: ThreadRead,
  selection: ReadSelection
): Action[] => {
  if (selection === "primary" || "alternativeIndex" in selection) {
    return [];
  }
  const selected = new Set(selection.primaryActionIndices);
  return read.primary.filter((_, index) => !selected.has(index));
};
