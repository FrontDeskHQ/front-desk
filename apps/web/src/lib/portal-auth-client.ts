import { createAuthClient } from "better-auth/react";
import { getBaseApiUrl } from "./urls";

export const portalAuthClient = createAuthClient({
  baseURL: getBaseApiUrl() as string,
  basePath: "/api/portal-auth",
});
