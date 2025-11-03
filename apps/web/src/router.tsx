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
        try {
          const allowedDomains = ["tryfrontdesk.app", "localhost"];
          const hostname = url.hostname;
          if (!hostname) return undefined;

          // Find a matching domain that the hostname ends with (and has a subdomain)
          let matchedDomain: string | undefined;
          for (const d of allowedDomains) {
            if (hostname.endsWith(`.${d}`)) {
              matchedDomain = d;
              break;
            }
          }
          if (!matchedDomain) return undefined;

          const suffix = `.${matchedDomain}`;
          const subdomain = hostname.slice(0, hostname.length - suffix.length);
          if (!subdomain) return undefined;
          // ignore common hostnames that shouldn't be treated as orgs
          if (subdomain === "www" || subdomain === "app") return undefined;

          // Rewrite rules:
          // - If hitting root (e.g. acme-inc.localhost:3000/), send to /support/<org>/threads
          // - If hitting /support or /support/... insert the org as the next segment
          const pathname = url.pathname || "/";

          if (pathname === "/") {
            // direct root -> go to threads for the org
            url.pathname = `/support/${subdomain}/threads`;
          } else if (pathname.startsWith("/support")) {
            // Avoid double-inserting the org if already present
            const segments = pathname.split("/").filter(Boolean); // ['support', ...]
            if (segments[1] === subdomain) return undefined;

            const rest =
              pathname === "/support" ? "" : pathname.replace("/support", "");
            url.pathname = `/support/${subdomain}${rest}`;
          } else {
            // not a route we care to rewrite
            return undefined;
          }

          // For production domain normalize to primary domain; for localhost keep 'localhost'
          url.hostname =
            matchedDomain === "tryfrontdesk.app"
              ? "tryfrontdesk.app"
              : "localhost";
          return url;
        } catch {
          return undefined;
        }
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
