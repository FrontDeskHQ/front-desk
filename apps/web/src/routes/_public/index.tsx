import { createFileRoute } from "@tanstack/react-router";
import { HorizontalLine } from "@workspace/ui/components/surface";

import { CategoryAssertionSection } from "~/components/landing-page/category-assertion-section";
import { KeepCaringSection } from "~/components/landing-page/keep-caring-section";
import { OneLinerSection } from "~/components/landing-page/one-liner-section";
import { PicksUpSection } from "~/components/landing-page/picks-up-section";
import { PullsYouInSection } from "~/components/landing-page/pulls-you-in-section";
import { RepliesSection } from "~/components/landing-page/replies-section";
import { LandingMotionStyles } from "~/components/landing-page/shared/motion-styles";

export const Route = createFileRoute("/_public/")({
  component: RouteComponent,
  head: () => ({
    links: [
      // Lato is the hero's Slack panel typeface — declared by the only page
      // that uses it, and discoverable in <head> instead of mid-body.
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
  }),
});

function SectionLabel({ n, name }: { n: string; name: string }) {
  return (
    <>
      {/* Full-bleed seam above the label (§5) */}
      <HorizontalLine variant="full" lineStyle="solid" />
      <div className="col-span-full grid grid-cols-24 border-b pt-8 pb-4">
        <div className="text-foreground-secondary col-span-full max-md:col-span-22 max-md:col-start-2 font-mono uppercase md:col-span-22 md:col-start-2">
          {n} - {name}
        </div>
      </div>
    </>
  );
}

function RouteComponent() {
  return (
    <main className="mx-auto grid w-full max-w-[90rem] grid-cols-24">
      <LandingMotionStyles />

      {/* 0. Hero — sits above the bordered slab */}
      <OneLinerSection />

      <HorizontalLine variant="full" lineStyle="solid" />

      {/* Rails begin below the hero */}
      <div className="col-span-full grid grid-cols-24 border-x">
        {/* 1. Category assertion */}
        <CategoryAssertionSection />

        {/* 2. Section 01 — Picks up every conversation */}
        <SectionLabel n="01" name="Picks up every conversation" />
        <PicksUpSection />

        {/* 3. Section 02 — Handles it like you would */}
        <SectionLabel n="02" name="Handles it like you would" />
        <RepliesSection />

        {/* 4. Section 03 — Pulls you in only when it matters */}
        <SectionLabel n="03" name="Pulls you in only when it matters" />
        <PullsYouInSection />

        {/* 5. Proof — intentionally omitted until it's real. Testimonial,
            the number, and trust posture all still [TBD]; shipping the
            placeholders costs more credibility than the empty slot does. */}

        {/* 6. Closing CTA */}
        <KeepCaringSection />
      </div>
    </main>
  );
}
