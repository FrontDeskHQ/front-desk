import type { ActionHandlerRegistry } from "../types";
import { applyLabelHandler } from "./apply-label";
import { closeHandler } from "./close";
import { linkPrHandler } from "./link-pr";
import { markDuplicateHandler } from "./mark-duplicate";
import { replyHandler } from "./reply";
import { setStatusHandler } from "./set-status";

export const createActionHandlerRegistry = (): ActionHandlerRegistry =>
  ({
    apply_label: applyLabelHandler,
    close: closeHandler,
    link_pr: linkPrHandler,
    mark_duplicate: markDuplicateHandler,
    reply: replyHandler,
    set_status: setStatusHandler,
  }) as ActionHandlerRegistry;
