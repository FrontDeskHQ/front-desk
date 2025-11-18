import "@fontsource-variable/intel-one-mono";
import "@fontsource-variable/inter";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { Toaster } from "@workspace/ui/components/sonner";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { Providers } from "~/components/providers";
import { seo } from "~/utils/seo";
import "../../../../packages/ui/src/styles/globals.css";
import ogImage from "../assets/frontdesk-og.png";

const getBaseUrl = createIsomorphicFn()
  .server(() => {
    try {
      const url = getRequestUrl();
      return `${url.protocol}//${url.host}`;
    } catch {
      return import.meta.env.VITE_BASE_URL ?? "https://tryfrontdesk.app";
    }
  })
  .client(() => {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}`;
    }
    return "https://tryfrontdesk.app";
  });

const getCurrentUrl = createIsomorphicFn()
  .server(() => {
    try {
      const url = getRequestUrl();
      return url.toString();
    } catch {
      return import.meta.env.VITE_BASE_URL ?? "https://tryfrontdesk.app";
    }
  })
  .client(() => {
    if (typeof window !== "undefined") {
      return window.location.href;
    }
    return "https://tryfrontdesk.app";
  });

export const Route = createRootRoute({
  head: () => {
    const baseUrl = getBaseUrl();
    const currentUrl = getCurrentUrl();
    const description =
      "The all in one customer support platform. Making good customer support extremely easy.";

    const ogImageUrl = ogImage.startsWith("http")
      ? ogImage
      : `${baseUrl}${ogImage.startsWith("/") ? ogImage : `/${ogImage}`}`;

    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        ...seo({
          title: "FrontDesk",
          description,
          image: ogImageUrl,
          keywords:
            "FrontDesk, FrontDesk AI, FrontDesk Support, FrontDesk Help Desk, FrontDesk Ticketing, FrontDesk Ticketing System, FrontDesk Ticketing Software, AI Help Desk, Customer Support Software, Ticketing System, Support Ticket Management, AI Customer Service",
          url: currentUrl,
          type: "website",
          siteName: "FrontDesk",
          locale: "en_US",
          author: "FrontDesk",
        }),
      ],
      links: [
        { rel: "canonical", href: currentUrl },
        { rel: "manifest", href: "/site.webmanifest" },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/favicon.svg" },
      ],
    };
  },
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Router error component props
  errorComponent: (props: any) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="w-full min-h-screen text-sm">
        <Providers>
          {children}
          <TanStackRouterDevtools position="bottom-right" />
          <Toaster />
        </Providers>
        <Scripts />
      </body>
    </html>
  );
}
