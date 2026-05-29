import type { LinkPrAction } from "@workspace/schemas/signals";
import type { ActionHandler } from "../types";

export const linkPrHandler: ActionHandler<LinkPrAction> = {
  async apply() {
    throw new Error("LINK_PR_DEFERRED");
  },
};
