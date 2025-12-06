import type { subdomainOAuth } from "api/plugins/subdomain-oauth";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { createAuthClient } from "better-auth/react";
import { getBaseApiUrl } from "./urls";

const subdomainOAuthClient = () => {
  return {
    id: "subdomain-oauth",
    $InferServerPlugin: {} as ReturnType<typeof subdomainOAuth>,
  } satisfies BetterAuthClientPlugin;
};

export const portalAuthClient = createAuthClient({
  baseURL: getBaseApiUrl() as string,
  basePath: "/api/portal-auth",
  plugins: [subdomainOAuthClient()],
});
