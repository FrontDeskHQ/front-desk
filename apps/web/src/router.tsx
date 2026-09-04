import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import qs from "qs";

import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { NotFound } from "./components/NotFound";
import { routeTree } from "./routeTree.gen";

const baseUrl = new URL(
  import.meta.env.VITE_BASE_URL ?? "http://localhost:3000"
);
const baseHostname = baseUrl.hostname;

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createTanStackRouter({
    context: { queryClient },
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    defaultPreload: "intent",
    parseSearch: (search) => {
      return qs.parse(search.slice(1));
    },
    rewrite: {
      // Send retired organization subdomains to the permanent 410 handler.
      input: ({ url }) => {
        const hostname = url.hostname;

        const suffixRegex = new RegExp(`\\.?${baseHostname}$`);
        const subdomain = hostname.replace(suffixRegex, "");
        if (!subdomain) return;

        url.hostname = baseHostname;
        url.pathname = `/support/${subdomain}${url.pathname}`;

        return url;
      },
    },
    routeTree,
    scrollRestoration: true,
    stringifySearch: (search) => {
      const searchStr = qs.stringify(search, { arrayFormat: "brackets" });
      return searchStr ? `?${searchStr}` : "";
    },
  });

  setupRouterSsrQueryIntegration({
    queryClient,
    router,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
