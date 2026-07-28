import { createFileRoute } from "@tanstack/react-router";
import { HorizontalLine } from "@workspace/ui/components/surface";

import { OneLinerSection } from "~/components/landing-page/one-liner-section";
import { PicksUpSection } from "~/components/landing-page/picks-up-section";
import { TensionSection } from "~/components/landing-page/tension-section";

export const Route = createFileRoute("/_public/")({
  component: RouteComponent,
});

function SectionLabel({ n, name }: { n: string; name: string }) {
  return (
    <>
      {/* Full-bleed seam above the label (§5) */}
      <HorizontalLine variant="full" lineStyle="solid" />
      <div className="col-span-full grid grid-cols-24 border-b pt-8 pb-4">
        <div className="text-foreground-secondary col-span-full font-mono uppercase md:col-span-22 md:col-start-2">
          {n} - {name}
        </div>
      </div>
    </>
  );
}

function RouteComponent() {
  return (
    <main className="mx-auto grid w-full max-w-[90rem] grid-cols-24">
      {/* 0. Hero — sits above the bordered slab */}
      <OneLinerSection />

      <HorizontalLine variant="full" lineStyle="solid" />

      {/* Rails begin below the hero */}
      <div className="col-span-full grid grid-cols-24 border-x">
        {/* 1. The tension */}
        <TensionSection />

        {/* 2. Section 01 — Picks up every conversation */}
        <SectionLabel n="01" name="Picks up every conversation" />
        <PicksUpSection />

        {/* 3. Section 02 — Replies in your voice */}
        <SectionLabel n="02" name="Replies in your voice" />
        <section id="replies" className="col-span-full p-8">
          <h2>Replies in your voice.</h2>
          <p>Care, automated</p>
          <ul>
            <li>
              Tuned on your past replies, docs, and tone — on-brand, never
              canned bot-speak.
            </li>
            <li>
              Resolves the routine end-to-end: how-tos, status, refunds, common
              bugs.
            </li>
            <li>
              Reads like your best teammate wrote it — the customer feels cared
              for, not deflected.
            </li>
            <li>
              Gets better every time you edit a draft — your corrections become
              its training.
            </li>
            <li>
              Knows what it doesn't know — asks or escalates instead of
              guessing.
            </li>
          </ul>
        </section>

        {/* 4. Section 03 — Pulls you in only when it matters */}
        <SectionLabel n="03" name="Pulls you in" />
        <section id="pulls-you-in" className="col-span-full p-8">
          <h2>
            Pulls you in
            <br />
            only when it matters.
          </h2>
          <p>You stay in control</p>
          <ul>
            <li>
              The hard ~20% comes to you — with full context and a suggested
              reply, ready to send.
            </li>
            <li>
              You set the policy: what the Agent can send alone, what always
              needs a human.
            </li>
            <li>
              Every autonomous reply is logged, attributed, and reversible — no
              black box.
            </li>
            <li>
              Your attention goes to the relationships that actually need you.
            </li>
            <li>
              Governance improves as you use it — the policy learns your line.
            </li>
          </ul>
        </section>

        {/* 5. Proof — slots only until real */}
        <SectionLabel n="04" name="Proof" />
        <section id="proof" className="col-span-full p-8">
          <h2>Proof</h2>
          <p>Testimonial — [TBD]</p>
          <p>The number — [TBD]</p>
          <p>Trust — [TBD]</p>
        </section>

        {/* 6. Closing CTA */}
        <SectionLabel n="05" name="Keep caring" />
        <section id="cta" className="col-span-full p-8">
          <h2>
            Keep caring.
            <br />
            At any scale.
          </h2>
          <p>
            <a href="#hero">See it handle a thread</a>
          </p>
          <p>
            <a href="mailto:hello@tryfrontdesk.app">Talk to us</a>
          </p>
        </section>
      </div>
    </main>
  );
}
