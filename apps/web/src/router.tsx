import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import qs from "qs";
import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { NotFound } from "./components/NotFound";
import { routeTree } from "./routeTree.gen";

const baseUrl = new URL(
  import.meta.env.VITE_BASE_URL ?? "http://localhost:3000",
);
const baseHostname = baseUrl.hostname;

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    context: { queryClient },
    rewrite: {
      // Rewrite incoming URLs so that subdomains for orgs become path segments
      // e.g. acme-inc.tryfrontdesk.app -> tryfrontdesk.app/support/acme-inc/threads
      input: ({ url }) => {
        const hostname = url.hostname;

        const suffixRegex = new RegExp(`\\.?${baseHostname}$`);
        const subdomain = hostname.replace(suffixRegex, "");
        if (!subdomain) return undefined;

        url.hostname = baseHostname;
        url.pathname = `/support/${subdomain}${url.pathname}`;

        return url;
      },
      output: ({ url }) => {
        // Rewrite outgoing URLs so that path segments for orgs become subdomains
        // e.g. tryfrontdesk.app/support/acme-inc/threads -> acme-inc.tryfrontdesk.app
        // e.g. tryfrontdesk.app/support/acme-inc/threads/01k98em74mj13jzafk4efs8pj8 -> acme-inc.tryfrontdesk.app/threads/01k98em74mj13jzafk4efs8pj8
        const pathParts = url.pathname.split("/");
        const isSupportPath = pathParts[1] === "support";
        if (!isSupportPath) return;

        const subdomain = pathParts[2];
        if (!subdomain) return;
        const restOfPath = pathParts.slice(3).join("/");

        url.hostname = `${subdomain}.${baseHostname}`;
        url.pathname = `/${restOfPath}`;

        return url;
      },
    },
    stringifySearch: (search) => {
      const searchStr = qs.stringify(search, { arrayFormat: "brackets" });
      return searchStr ? `?${searchStr}` : "";
    },
    parseSearch: (search) => {
      return qs.parse(search.slice(1));
    },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
