import "@fontsource-variable/intel-one-mono";
import "@fontsource-variable/inter";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "@workspace/ui/components/sonner";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { Providers } from "~/components/providers";
import { seo } from "~/utils/seo";
import { absoluteAssetUrl, getCurrentUrl } from "~/utils/url";

import "../../../../packages/ui/src/styles/globals.css";
import ogImage from "../assets/frontdesk-og.png";

export const Route = createRootRoute({
  head: () => {
    const currentUrl = getCurrentUrl();
    // Site-wide defaults only. Landing-specific copy lives in the `/_public/`
    // index route so pages like /updates don't inherit the landing SEO.
    const description =
      "The all in one customer support platform. Making good customer support extremely easy.";

    const ogImageUrl = absoluteAssetUrl(ogImage);

    return {
      links: [
        { rel: "canonical", href: currentUrl },
        { rel: "manifest", href: "/site.webmanifest" },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/favicon.svg" },
      ],
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
          keywords:
            "FrontDesk, FrontDesk AI, FrontDesk Support, FrontDesk Help Desk, FrontDesk Ticketing, FrontDesk Ticketing System, FrontDesk Ticketing Software, AI Help Desk, Customer Support Software, Ticketing System, Support Ticket Management, AI Customer Service",
          url: currentUrl,
          siteName: "FrontDesk",
          locale: "en_US",
          author: "FrontDesk",
          openGraph: {
            title: "FrontDesk",
            description,
            image: ogImageUrl,
            url: currentUrl,
            type: "website",
            siteName: "FrontDesk",
            locale: "en_US",
          },
        }),
      ],
    };
  },
  errorComponent: (props: ErrorComponentProps) => (
    <RootDocument>
      <DefaultCatchBoundary {...props} />
    </RootDocument>
  ),
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
      <body className="w-100vw min-h-screen text-sm">
        <Providers>
          <NuqsAdapter>
            {children}
            <TanStackRouterDevtools position="bottom-right" />
            <Toaster />
          </NuqsAdapter>
        </Providers>
        <Scripts />
      </body>
    </html>
  );
}
