import { routeFactory } from "@live-state/sync/server";

import { isWidgetIdentityActive } from "../lib/widget-identity";
import type { schema } from "./schema";

export const publicRoute = routeFactory<typeof schema>().use(
  async ({ req, next }) => {
    const identity = req.context?.widgetIdentity;
    if (identity && !(await isWidgetIdentityActive(identity))) {
      throw new Error("UNAUTHORIZED");
    }

    return next(req);
  }
);

export const privateRoute = publicRoute.use(async ({ req, next }) => {
  if (!req.context?.session && !req.context?.internalApiKey) {
    throw new Error("Unauthorized");
  }

  return next(req);
});
