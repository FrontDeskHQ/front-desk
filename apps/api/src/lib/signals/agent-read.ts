import {
  fingerprintAgentRead,
  nextAgentReadAfterExecution,
} from "@workspace/schemas/signals";
import type { Action, ThreadRead } from "@workspace/schemas/signals";

import { errors } from "../errors";

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
    throw errors.conflict(
      "STALE_AGENT_READ",
      "This signal changed in the background. Refresh and try again."
    );
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
      throw errors.badRequest(
        "INVALID_SELECTION",
        "The selected actions don't match this signal"
      );
    }
    bundle = [alternative];
  } else {
    if (selection.primaryActionIndices.length === 0) {
      throw errors.badRequest(
        "INVALID_SELECTION",
        "The selected actions don't match this signal"
      );
    }
    // Normalize so duplicate or reordered indices can't replay or reorder a
    // primary action's side effects.
    const normalizedIndices = [
      ...new Set(selection.primaryActionIndices),
    ].toSorted((a, b) => a - b);
    bundle = normalizedIndices.map((index) => {
      const action = read.primary[index];
      if (!action) {
        throw errors.badRequest(
          "INVALID_SELECTION",
          "The selected actions don't match this signal"
        );
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
