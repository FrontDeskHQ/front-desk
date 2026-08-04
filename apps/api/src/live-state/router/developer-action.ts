import type { ServerDB } from "@live-state/sync/server";
import { z } from "zod";

import type { AuthorizeReq } from "../../lib/authorize";
import { authorizeDeveloperAction } from "../../lib/authorize";
import type { DeveloperActionAcceptedResult } from "../../lib/developer-action-dispatch";
import {
  DeveloperActionError,
  dispatchDeveloperAction,
} from "../../lib/developer-action-dispatch";
import { publicRoute } from "../factories";
import type { schema } from "../schema";

const developerActionPayloadSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .superRefine((payload, context) => {
    if ("integrationId" in payload) {
      context.addIssue({
        code: "custom",
        message: "integrationId is not accepted",
        path: ["integrationId"],
      });
    }
  });

export const developerActionInputSchema = z
  .object({
    action: z.string().min(1),
    connectorType: z.string().min(1),
    organizationId: z.string().min(1),
    payload: developerActionPayloadSchema,
  })
  .strict();

export type DeveloperActionInput = z.infer<typeof developerActionInputSchema>;

const getErrorCode = (error: unknown): string =>
  error instanceof DeveloperActionError
    ? error.code
    : "DEVELOPER_ACTION_FAILED";

const logDeveloperActionEvent = (event: Record<string, unknown>): void => {
  console.info(JSON.stringify(event));
};

export const runDeveloperAction = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  req: AuthorizeReq,
  input: DeveloperActionInput
): Promise<DeveloperActionAcceptedResult> => {
  // This must remain before action target/integration resolution so a denied
  // caller cannot probe connector configuration or cross-org targets.
  const actor = authorizeDeveloperAction(req, input.organizationId, {
    action: input.action,
  });

  try {
    const result = await dispatchDeveloperAction(db, {
      action: input.action,
      connectorType: input.connectorType,
      organizationId: input.organizationId,
      payload: input.payload,
    });

    logDeveloperActionEvent({
      action: input.action,
      actorUserId: actor.userId,
      connectorType: input.connectorType,
      event: "developer_action.accepted",
      jobIds: result.jobIds,
      organizationId: input.organizationId,
      ...(result.target ? { target: result.target } : {}),
    });

    return result;
  } catch (error) {
    const errorCode = getErrorCode(error);
    logDeveloperActionEvent({
      action: input.action,
      actorUserId: actor.userId,
      connectorType: input.connectorType,
      error: errorCode,
      event: "developer_action.failed",
      organizationId: input.organizationId,
    });
    throw new Error(errorCode, { cause: error });
  }
};

export default publicRoute.withProcedures(({ mutation }) => ({
  invoke: mutation(developerActionInputSchema).handler(({ db, req }) =>
    runDeveloperAction(db, req, req.input)
  ),
}));
