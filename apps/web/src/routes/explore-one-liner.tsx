import { createFileRoute } from "@tanstack/react-router";

import { OneLinerSection } from "~/components/landing-page/one-liner-section";
import { LandingMotionStyles } from "~/components/landing-page/shared/motion-styles";

export const Route = createFileRoute("/explore-one-liner")({
  component: RouteComponent,
  head: () => ({
    links: [
      // Same Lato links the landing route declares — without them this preview
      // renders the Slack mock in a different typeface than the real hero.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap",
      },
    ],
    // A preview path that renders homepage content is duplicate content.
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});

/** Isolated preview of the landing one-liner section. */
function RouteComponent() {
  return (
    // overflow-x-clip: the hero's glare backdrop breaks out to 100vw and would
    // otherwise raise a horizontal scrollbar on this bare route.
    <main className="flex min-h-screen items-center justify-center overflow-x-clip bg-background-primary">
      <LandingMotionStyles />
      <OneLinerSection />
    </main>
  );
}
