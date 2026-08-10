import type { ActionHandlerRegistry } from "../types";
import { applyLabelHandler } from "./apply-label";
import { createIssueHandler } from "./create-issue";
import { linkIssueHandler } from "./link-issue";
import { linkPrHandler } from "./link-pr";
import { markDuplicateHandler } from "./mark-duplicate";
import { replyHandler } from "./reply";
import { setStatusHandler } from "./set-status";

export const createActionHandlerRegistry = (): ActionHandlerRegistry =>
  ({
    apply_label: applyLabelHandler,
    create_issue: createIssueHandler,
    link_issue: linkIssueHandler,
    link_pr: linkPrHandler,
    mark_duplicate: markDuplicateHandler,
    reply: replyHandler,
    set_status: setStatusHandler,
  }) as ActionHandlerRegistry;
