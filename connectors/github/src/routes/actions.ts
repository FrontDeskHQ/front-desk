import {
  ACTION_INVOKE_PATH,
  ACTION_INVOKE_SECRET_HEADER,
  actionInvokeEnvelopeSchema,
} from "@connectors/framework";
import Elysia from "elysia";

/** A connector-owned developer action handler. */
export type DeveloperActionHandler = (
  config: string,
  payload: unknown
) => Promise<DeveloperActionHandlerResult>;

/** A handled response: an HTTP status plus the JSON body to return. */
export interface DeveloperActionHandlerResult {
  body: unknown;
  status: number;
}

/**
 * Build the action route from a private connector dispatch map. The GitHub
 * action names are intentionally not exposed through its manifest or a
 * discovery endpoint; FRO-211 adds the first production handlers.
 */
export const createDeveloperActionsRoute = (
  handlers: Readonly<Record<string, DeveloperActionHandler>>
) =>
  new Elysia().post(
    ACTION_INVOKE_PATH,
    async ({ body: requestBody, headers, set }) => {
      const expectedSecret = process.env.DISCORD_BOT_KEY;
      if (
        !expectedSecret ||
        headers[ACTION_INVOKE_SECRET_HEADER] !== expectedSecret
      ) {
        set.status = 401;
        return { error: "UNAUTHORIZED" };
      }

      const envelope = actionInvokeEnvelopeSchema.safeParse(requestBody);
      if (!envelope.success) {
        set.status = 400;
        return {
          error:
            envelope.error.issues[0]?.message ??
            "Invalid action invoke envelope",
        };
      }

      const { action, config, payload } = envelope.data;
      const handler = handlers[action];
      if (!handler) {
        set.status = 404;
        return { error: "UNKNOWN_ACTION" };
      }

      if (!config) {
        set.status = 400;
        return { error: "MISSING_CONFIG" };
      }

      try {
        const result = await handler(config, payload);
        set.status = result.status;
        return result.body;
      } catch {
        console.error(
          JSON.stringify({
            action,
            event: "developer_action.connector_failed",
          })
        );
        set.status = 500;
        return { error: "ACTION_FAILED" };
      }
    }
  );

// Keep the production dispatch map private to the connector. FRO-211 adds
// explicit action entries here without changing the capability manifest.
const developerActionHandlers: Readonly<
  Record<string, DeveloperActionHandler>
> = {};

export const developerActionsRoutes = createDeveloperActionsRoute(
  developerActionHandlers
);
