import { routeFactory } from "@live-state/sync/server";

export const publicRoute = routeFactory();

export const privateRoute = publicRoute.use(async ({ req, next }) => {
  if (!req.context.session && !req.context.internalApiKey) {
    throw new Error("Unauthorized");
  }

  return next(req);
});
