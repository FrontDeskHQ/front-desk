import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import qs from "qs";
import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { NotFound } from "./components/NotFound";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    // Rewrite incoming URLs so that subdomains for orgs become path segments
    // e.g. acme-inc.tryfrontdesk.app -> tryfrontdesk.app/support/acme-inc/threads
    rewrite: {
      input: ({ url }) => {
        const ALLOWED_DOMAINS = ["tryfrontdesk.app", "localhost"];
        const IGNORED_HOSTNAMES = ["www", "api", "app"];

        // Check if hostname matches our allowed domains
        const hostname = url.hostname;
        if (!hostname) return undefined;
        let matchedDomain: string | undefined;
        for (const d of ALLOWED_DOMAINS) {
          if (hostname.endsWith(`.${d}`)) {
            matchedDomain = d;
            break;
          }
        }
        if (!matchedDomain) return undefined;

        // Get org name (subdomain)
        const suffix = `.${matchedDomain}`;
        const subdomain = hostname.slice(0, hostname.length - suffix.length);
        if (!subdomain || IGNORED_HOSTNAMES.includes(subdomain))
          return undefined;
        
        // Validate subdomain format (alphanumeric and hyphens only)
        if (!/^[a-z0-9-]+$/i.test(subdomain)) return undefined;

        // Rewrite URL
        url.hostname = matchedDomain;
        url.pathname = `/support/${subdomain}/threads`;

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

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
