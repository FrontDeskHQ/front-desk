import { createRouter as createTanStackRouter } from "@tanstack/react-router";
// import qs from "qs";
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
    // TODO: Discuss the reasons for these optional parameters to be implemented and possible consequences of commenting it out
    //? This code was causing issues with array params in query strings (resolving /threadspage=2 instead of /threads?page=2)
    // stringifySearch: (search) =>
    //   qs.stringify(search, { arrayFormat: "brackets" }),
    // parseSearch: qs.parse,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
