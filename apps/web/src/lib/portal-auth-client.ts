import type { subdomainOAuth } from "api/plugins/subdomain-oauth";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { createAuthClient } from "better-auth/react";

import { getBaseApiUrl } from "./urls";

const subdomainOAuthClient = () =>
  ({
    id: "subdomain-oauth",
    $InferServerPlugin: {} as ReturnType<typeof subdomainOAuth>,
  }) satisfies BetterAuthClientPlugin;

export const portalAuthClient = createAuthClient({
  basePath: "/api/portal-auth",
  baseURL: getBaseApiUrl() as string,
  plugins: [subdomainOAuthClient()],
});
