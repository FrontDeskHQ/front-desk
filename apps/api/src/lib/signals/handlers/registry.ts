import type { ActionHandlerRegistry } from "../types";
import { applyLabelHandler } from "./apply-label";
import { closeHandler } from "./close";
import { linkPrHandler } from "./link-pr";
import { markDuplicateHandler } from "./mark-duplicate";
import { replyHandler } from "./reply";
import { setStatusHandler } from "./set-status";

export const createActionHandlerRegistry = (): ActionHandlerRegistry =>
  ({
    reply: replyHandler,
    mark_duplicate: markDuplicateHandler,
    close: closeHandler,
    link_pr: linkPrHandler,
    apply_label: applyLabelHandler,
    set_status: setStatusHandler,
  }) as ActionHandlerRegistry;
