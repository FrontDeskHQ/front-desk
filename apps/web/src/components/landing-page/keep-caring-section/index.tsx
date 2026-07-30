/**
 * 04 — Keep caring.
 * Closing CTA — echoes the hero. See COMPANY/landing-page-copy-v4.md §Close.
 */

import { Button } from "@workspace/ui/components/button";

import { EARLY_ACCESS_HREF, TALK_TO_US_HREF } from "../shared/links";

export function KeepCaringSection() {
  return (
    <section
      id="cta"
      className="col-span-full grid grid-cols-24 scroll-mt-15"
    >
      <div className="col-span-full flex flex-col items-center gap-10 px-6 py-24 text-center md:py-32">
        <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl lg:text-5xl">
          Keep caring.
          <br />
          However busy you get.
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="xl"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            render={
              <a href={EARLY_ACCESS_HREF} aria-label="Request early access" />
            }
          >
            Request early access
          </Button>
          <Button
            size="xl"
            variant="outline"
            render={<a href={TALK_TO_US_HREF} aria-label="Talk to us" />}
          >
            Talk to us
          </Button>
        </div>
      </div>
    </section>
  );
}
