import Elysia from "elysia";
import "./env";
import { app as githubApp } from "./lib/github";
import { issuesRoutes, pullRequestsRoutes, setupRoutes } from "./routes";
import { getPort } from "./utils";
import { setupWebhooks } from "./webhooks";

setupWebhooks();

const app = new Elysia()
  .use(issuesRoutes)
  .use(pullRequestsRoutes)
  .use(setupRoutes)
  .all("/*", async ({ request, set }) => {
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const deliveryId = request.headers.get("x-github-delivery");

    if (!signature || !event || !deliveryId) {
      set.status = 404;
      return { error: "Not found" };
    }

    try {
      const body = await request.text();

      await githubApp.webhooks.verifyAndReceive({
        id: deliveryId,
        name: event as any,
        signature,
        payload: body,
      });

      set.status = 200;
      return { ok: true };
    } catch (error) {
      console.error("[GitHub] Webhook verification failed:", error);
      set.status = 400;
      return { error: "Webhook verification failed" };
    }
  })
  .listen(getPort());

console.log(`Server listening on port ${getPort()}`);

export type App = typeof app;
