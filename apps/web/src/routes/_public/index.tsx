// Lato is the hero's Slack panel typeface. Self-hosted via fontsource and
// imported by the only route that uses it, so the CSS ships in this route's
// chunk instead of a render-blocking third-party request.
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import { createFileRoute } from "@tanstack/react-router";
import { HorizontalLine } from "@workspace/ui/components/surface";

import { CategoryAssertionSection } from "~/components/landing-page/category-assertion-section";
import { KeepCaringSection } from "~/components/landing-page/keep-caring-section";
import { OneLinerSection } from "~/components/landing-page/one-liner-section";
import { PicksUpSection } from "~/components/landing-page/picks-up-section";
import { PullsYouInSection } from "~/components/landing-page/pulls-you-in-section";
import { RepliesSection } from "~/components/landing-page/replies-section";
import { LandingMotionStyles } from "~/components/landing-page/shared/motion-styles";
import { seo } from "~/utils/seo";
import { absoluteAssetUrl, getCurrentUrl } from "~/utils/url";

import ogImage from "../../assets/frontdesk-og.png";

export const Route = createFileRoute("/_public/")({
  component: RouteComponent,
  head: () => {
    const currentUrl = getCurrentUrl();
    const description =
      "FrontDesk picks up every conversation, handles it like you would, and pulls you in only when it matters. Support built for teams that care, in Slack, Discord, email, and GitHub.";
    const title = "FrontDesk — Care for every customer. Even when you're busy.";

    return {
      meta: seo({
        title,
        description,
        keywords:
          "FrontDesk, FrontDesk AI, AI customer support, AI support agent, Slack customer support, Discord customer support, GitHub support, developer support tool, customer support for startups, shared inbox, customer support automation",
        url: currentUrl,
        siteName: "FrontDesk",
        locale: "en_US",
        author: "FrontDesk",
        openGraph: {
          title: "FrontDesk",
          description,
          image: absoluteAssetUrl(ogImage),
          url: currentUrl,
          type: "website",
          siteName: "FrontDesk",
          locale: "en_US",
        },
      }),
    };
  },
});

function SectionLabel({ n, name }: { n: string; name: string }) {
  return (
    <>
      {/* Full-bleed seam above the label (§5) */}
      <HorizontalLine variant="full" lineStyle="solid" />
      <div className="col-span-full grid grid-cols-24 pt-8 pb-4">
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
        <SectionLabel n="01" name="Intake" />
        <PicksUpSection />

        {/* 3. Section 02 — Handles it like you would */}
        <SectionLabel n="02" name="Resolution" />
        <RepliesSection />

        {/* 4. Section 03 — Pulls you in only when it matters */}
        <SectionLabel n="03" name="Escalation" />
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
