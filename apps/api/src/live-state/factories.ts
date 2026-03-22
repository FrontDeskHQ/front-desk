import { routeFactory } from "@live-state/sync/server";
import type { schema } from "./schema";

export const publicRoute = routeFactory<typeof schema>();

export const privateRoute = publicRoute.use(async ({ req, next }) => {
  if (!req.context?.session && !req.context?.internalApiKey) {
    throw new Error("Unauthorized");
  }

  return next(req);
});
