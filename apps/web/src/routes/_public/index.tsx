import { createFileRoute } from "@tanstack/react-router";
import { HorizontalLine } from "@workspace/ui/components/surface";
import { OneLinerSection } from "~/components/landing-page/one-liner-section";
import { TensionSection } from "~/components/landing-page/tension-section";

export const Route = createFileRoute("/_public/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="mx-auto grid w-full max-w-[90rem] grid-cols-12">
      {/* 0. Hero — sits above the bordered slab */}
      <OneLinerSection />

      <HorizontalLine variant="full" style="solid" />

      {/* Rails begin below the hero */}
      <div className="col-span-full grid grid-cols-12 border-x">
        {/* 1. The tension */}
        <TensionSection />

        {/* 2. Section 01 — Picks up every conversation */}
        <section id="picks-up" className="col-span-full p-8">
          <p>01</p>
          <h2>Picks up every conversation.</h2>
          <p>Always-on coverage</p>
          <ul>
            <li>
              Native to Slack, Discord, email & GitHub — where your customers
              already are, not another portal.
            </li>
            <li>
              Triages the moment a message lands, 24/7 — nothing waits for office
              hours.
            </li>
            <li>
              Nothing slips — every thread is seen, tagged, and tracked, even when
              no one's watching.
            </li>
            <li>
              Knows the customer's history and past threads before it says a word.
            </li>
            <li>
              De-dupes and links related issues so one problem isn't ten tickets.
            </li>
          </ul>
        </section>

        {/* 3. Section 02 — Replies in your voice */}
        <section id="replies" className="col-span-full p-8">
          <p>02</p>
          <h2>Replies in your voice.</h2>
          <p>Care, automated</p>
          <ul>
            <li>
              Tuned on your past replies, docs, and tone — on-brand, never canned
              bot-speak.
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
              Knows what it doesn't know — asks or escalates instead of guessing.
            </li>
          </ul>
        </section>

        {/* 4. Section 03 — Pulls you in only when it matters */}
        <section id="pulls-you-in" className="col-span-full p-8">
          <p>03</p>
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
              You set the policy: what the Agent can send alone, what always needs
              a human.
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
        <section id="proof" className="col-span-full p-8">
          <h2>Proof</h2>
          <p>Testimonial — [TBD]</p>
          <p>The number — [TBD]</p>
          <p>Trust — [TBD]</p>
        </section>

        {/* 6. Closing CTA */}
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
