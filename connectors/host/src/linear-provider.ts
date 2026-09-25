import type { AnyElysia } from "elysia";
import { z } from "zod";

import {
  completeLinearOAuth,
  readLinearOAuthEnvironment,
} from "./linear-oauth";
import type { LinearOAuthEnvironment } from "./linear-oauth";
import { parseLinearWebhook, verifyLinearWebhook } from "./linear-webhook";
import type { LinearWebhookDependencies } from "./linear-webhook";
import type { HostedConnector, HostedConnectorProvider } from "./provider";

const linearCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export interface LinearProviderSync extends LinearWebhookDependencies {
  close(): Promise<void>;
  enqueueWebhook(rawBody: string): Promise<unknown>;
  syncAll(): Promise<void>;
  syncIntegration(integrationId: string): Promise<unknown>;
  webhookSecret?: string;
}

export interface LinearProviderOptions {
  connector: HostedConnector;
  environment?: LinearOAuthEnvironment;
  fetcher?: typeof fetch;
  sync?: LinearProviderSync;
}

const registerLinearRoutes = (
  app: AnyElysia,
  environment: LinearOAuthEnvironment | undefined,
  fetcher: typeof fetch,
  sync: LinearProviderSync | undefined
) => {
  app.get("/linear/api/oauth/callback", async ({ query, set }) => {
    let oauthEnvironment: LinearOAuthEnvironment;
    try {
      oauthEnvironment = environment ?? readLinearOAuthEnvironment();
    } catch (error) {
      console.error("[Linear] OAuth is not configured:", error);
      set.status = 503;
      return { error: "LINEAR_OAUTH_NOT_CONFIGURED" };
    }

    const parsed = linearCallbackQuerySchema.safeParse(query);
    const settingsUrl = `${oauthEnvironment.frontendBaseUrl}/app/settings/organization/integration/linear`;
    if (!parsed.success) {
      return Response.redirect(`${settingsUrl}?error=missing_params`, 302);
    }
    const separator = parsed.data.state.indexOf(".");
    const integrationId = parsed.data.state.slice(0, separator);
    const state = parsed.data.state.slice(separator + 1);
    if (separator < 1 || !state) {
      return Response.redirect(`${settingsUrl}?error=invalid_state`, 302);
    }

    try {
      await completeLinearOAuth(
        { code: parsed.data.code, integrationId, state },
        oauthEnvironment,
        fetcher
      );
      sync?.syncIntegration(integrationId).catch((error) => {
        console.error("[Linear] Initial reconciliation failed:", error);
      });
      return Response.redirect(settingsUrl, 302);
    } catch (error) {
      console.error("[Linear] OAuth callback failed:", error);
      return Response.redirect(`${settingsUrl}?error=callback_error`, 302);
    }
  });

  app.post(
    "/linear/api/webhook",
    async ({ body, headers, set }) => {
      const rawBody = typeof body === "string" ? body : "";
      const signature = headers["linear-signature"];
      if (
        !sync?.webhookSecret ||
        !signature ||
        !verifyLinearWebhook(rawBody, signature, sync.webhookSecret)
      ) {
        set.status = 401;
        return { error: "INVALID_SIGNATURE" };
      }
      try {
        parseLinearWebhook(rawBody);
        await sync.enqueueWebhook(rawBody);
        return { ok: true };
      } catch (error) {
        console.error("[Linear] Webhook failed:", error);
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
          set.status = 400;
          return { error: "INVALID_WEBHOOK" };
        }
        set.status = 500;
        return { error: "WEBHOOK_PROCESSING_FAILED" };
      }
    },
    { parse: "text" }
  );
};

export const createLinearProvider = ({
  connector,
  environment,
  fetcher = fetch,
  sync,
}: LinearProviderOptions): HostedConnectorProvider => {
  let reconciliationTimer: ReturnType<typeof setInterval> | undefined;
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  const inFlightReconciliations = new Set<Promise<void>>();
  const startupRetryDelaysMs = [1000, 5000, 30_000];
  let stopped = false;

  const trackReconciliation = (onFailure: (error: unknown) => void): void => {
    if (!sync || stopped) return;
    const reconciliation = (async () => {
      if (stopped) return;
      await sync.syncAll();
    })();
    inFlightReconciliations.add(reconciliation);
    void reconciliation.catch(onFailure).finally(() => {
      inFlightReconciliations.delete(reconciliation);
    });
  };

  const runStartupReconciliation = (attempt = 0): void => {
    trackReconciliation((error) => {
      console.error("[Linear] Startup reconciliation failed:", error);
      if (stopped) return;
      const retryDelay = startupRetryDelaysMs[attempt];
      if (retryDelay === undefined) return;

      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        if (!stopped) runStartupReconciliation(attempt + 1);
      }, retryDelay);
      retryTimers.add(timer);
      timer.unref();
    });
  };

  const runDailyReconciliation = (): void => {
    trackReconciliation((error) => {
      console.error("[Linear] Daily reconciliation failed:", error);
    });
  };

  return {
    connector,
    registerRoutes: (app) =>
      registerLinearRoutes(app, environment, fetcher, sync),
    start: () => {
      if (!sync || stopped) return;
      runStartupReconciliation();
      reconciliationTimer = setInterval(
        () => {
          if (stopped) return;
          runDailyReconciliation();
        },
        24 * 60 * 60 * 1000
      );
      reconciliationTimer.unref();
    },
    stop: async () => {
      stopped = true;
      if (reconciliationTimer) {
        clearInterval(reconciliationTimer);
        reconciliationTimer = undefined;
      }
      for (const timer of retryTimers) clearTimeout(timer);
      retryTimers.clear();
      await Promise.allSettled(inFlightReconciliations);
      await sync?.close();
    },
  };
};
