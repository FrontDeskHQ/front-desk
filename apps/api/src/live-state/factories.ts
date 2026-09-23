import { routeFactory } from "@live-state/sync/server";

import { errors } from "../lib/errors";
import { isWidgetIdentityActive } from "../lib/widget-identity";
import type { schema } from "./schema";

export const publicRoute = routeFactory<typeof schema>().use(
  async ({ req, next }) => {
    const identity = req.context?.widgetIdentity;
    if (identity && !(await isWidgetIdentityActive(identity))) {
      throw errors.unauthorized(
        "WIDGET_IDENTITY_REVOKED",
        "This widget session is no longer valid"
      );
    }

    return next(req);
  }
);

export const privateRoute = publicRoute.use(async ({ req, next }) => {
  if (!req.context?.session && !req.context?.internalApiKey) {
    throw errors.unauthorized();
  }

  return next(req);
});
