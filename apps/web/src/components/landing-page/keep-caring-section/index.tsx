/**
 * 04 — Keep caring.
 * Closing CTA — echoes the hero.
 */

import { Button } from "@workspace/ui/components/button";
import { HorizontalLine } from "@workspace/ui/components/surface";

import { EarlyAccessDialog } from "../shared/early-access-dialog";
import { TALK_TO_US_HREF } from "../shared/links";

export function KeepCaringSection() {
  return (
    <>
      <HorizontalLine variant="full" lineStyle="solid" />
      <section
        id="cta"
        className="col-span-full grid grid-cols-24 scroll-mt-15"
      >
        <div className="col-span-full max-md:col-span-22 max-md:col-start-2 flex flex-col items-center gap-10 py-24 text-center md:py-48">
          <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl lg:text-5xl">
            Keep caring.
            <br />
            However busy you get.
          </h2>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <EarlyAccessDialog
              trigger={
                <Button
                  size="xl"
                  className="bg-primary text-primary-foreground dark:bg-primary-foreground dark:text-primary hover:bg-primary/90 dark:hover:bg-primary/90"
                  aria-label="Request early access"
                >
                  Request early access
                </Button>
              }
            />
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
    </>
  );
}
