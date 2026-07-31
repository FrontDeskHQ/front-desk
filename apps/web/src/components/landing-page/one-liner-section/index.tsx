import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

import {
  FD_DESIGN_W,
  ScaledContentFrame,
  SLACK_THREAD_DESIGN_W,
  SLACK_THREAD_WIDTH_RATIO,
} from "../shared/app-chrome/product-mock-frame";
import { EarlyAccessDialog } from "../shared/early-access-dialog";
import { TALK_TO_US_HREF } from "../shared/links";
import { RedGlareBackground } from "../shared/red-glare";
import { FrontDeskApp } from "./mock/front-desk-app";

/**
 * Landing hero — one-liner + dual mocks.
 * Top: the one-liner. Below: FrontDesk UI (full-width 16:9) with the
 * Slack thread floating over the bottom-right corner, partly outside the
 * frame. Both share the same
 * phase script:
 *   01 picks up      → a message lands (thread view)
 *   02 handles it    → Agent resolves it in Pedro's voice (thread view)
 *   03 pulls you in  → Signals page + new signal pop-in (human action)
 */

/* Scripted phases. `hl` = which sentence part is lit (0/1/2). */
const PHASES = [
  { hl: 0, dur: 900 }, //  customer typing
  { hl: 0, dur: 1300 }, // customer message
  { hl: 1, dur: 1100 }, // Agent typing
  { hl: 1, dur: 2400 }, // Agent reply
  { hl: 2, dur: 900 }, //  customer typing again → switch to Signals, signal pops in
  { hl: 2, dur: 2000 }, // churn-risk reply in Slack
  { hl: 2, dur: 3600 }, // hold on signal
  { hl: 2, dur: 1600 }, // hold, then loop
] as const;

export function OneLinerSection() {
  const [phase, setPhase] = useState(0);
  const mockAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(
      () => setPhase((p) => (p + 1) % PHASES.length),
      PHASES[phase].dur
    );
    return () => clearTimeout(t);
  }, [phase]);

  const hl = PHASES[phase].hl;

  return (
    <section
      id="hero"
      className="relative col-span-full grid grid-cols-24 bg-background-primary pt-40 pb-16 text-foreground-primary scroll-mt-15"
    >
      {/* Glare backdrop — breaks the 90rem grid to span the full viewport, so
          the field reads as sky behind the page rather than a boxed panel.
          `w-screen` is 100vw (scrollbar included); the `_public` layout carries
          `overflow-x-clip` to swallow that overhang without a scroll container.
          The top third is pure background, so the canvas starts there rather
          than being masked away — fewer pixels to shade. It fades in over its
          own height and hits full strength on a hard cut at the section edge. */}
      <div
        className="pointer-events-none absolute top-1/3 bottom-0 left-1/2 w-screen -translate-x-1/2 select-none"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 100%)",
        }}
      >
        {/* Vignette — punches the glare out behind the mocks so the UI reads on
            flat dark. Anchored to the canvas's top edge, so the dark pocket
            hangs down over the mocks and the field burns in below and to the
            sides. Mixed units on purpose: the width is rem so it tracks the
            90rem content column rather than growing with the viewport, while
            the height is a % of the canvas so it scales with however tall the
            hero renders. Nested rather than composited: the two masks multiply
            on their own, no `mask-composite` needed. */}
        <div
          className="absolute inset-0"
          style={{
            maskImage:
              "radial-gradient(ellipse 62rem 175% at 50% 0%, transparent 0%, transparent 45%, black 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 62rem 175% at 50% 0%, transparent 0%, transparent 45%, black 100%)",
          }}
        >
          <RedGlareBackground className="absolute inset-0 h-full w-full" />
        </div>
      </div>

      <div className="relative col-span-22 col-start-2 flex w-full flex-col gap-30">
        {/* ---------- HERO COPY ---------- */}
        <div className="flex w-full flex-col gap-8 max-w-2xl">
          <h1 className="text-4xl leading-tight font-medium tracking-tight md:text-5xl">
            Care for every customer.
            <br />
            Even when you&apos;re busy.
          </h1>
          <div className="flex flex-col gap-8">
            <h2 className="text-2xl leading-tight font-light tracking-tight text-foreground-primary/45 transition-colors md:text-[1.75rem]">
              <Part active={hl === 0}>
                FrontDesk picks up every conversation,
              </Part>{" "}
              <Part active={hl === 1}>handles it like you would,</Part>{" "}
              <Part active={hl === 2}>
                and pulls you in only when it matters
              </Part>
              .
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <EarlyAccessDialog
                trigger={
                  <Button
                    size="xl"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
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
        </div>

        {/* ---------- MOCKS: FrontDesk full-bleed, Slack floating ---------- */}
        <div ref={mockAreaRef} className="relative w-full">
          <div className="relative overflow-visible rounded-md shadow-[0_40px_100px_-20px_rgba(0,0,0,0.55),0_20px_50px_-15px_rgba(0,0,0,0.4)]">
            <FrontDeskApp phase={phase} page={hl < 2 ? "threads" : "signals"} />
            <div
              role="img"
              aria-label="A Slack thread in #support where a customer reports failing webhooks and FrontDesk replies in Pedro's voice"
              className="absolute right-0 -bottom-2 z-10 translate-x-0 shadow-2xl sm:-bottom-4 min-[1650px]:translate-x-[36%]"
              style={{ width: `${SLACK_THREAD_WIDTH_RATIO * 100}%` }}
            >
              <div inert className="pointer-events-none select-none">
                <ScaledContentFrame
                  designWidth={SLACK_THREAD_DESIGN_W}
                  scaleBaseWidth={FD_DESIGN_W}
                  scaleSourceRef={mockAreaRef}
                >
                  <SlackThread phase={phase} />
                </ScaledContentFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- */

function Part({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "transition-colors duration-300",
        active && "text-foreground-primary"
      )}
    >
      {children}
    </span>
  );
}

/* ======================== Slack mock ======================== */

/* rebuild: Slack, not FrontDesk — nothing in the product renders this, so there
 *   is no source to pin and no drift to check. Slack layout, our color tokens.
 * reuse: none — every glyph below is hand-drawn to match Slack's composer
 * state: #support thread, phase-gated: customer report → Agent reply → pushback
 * marketing: Lato is loaded by the /_public route's `head`, not here — this
 *   panel only asks for it. Caller owns inert / role=img.
 */
function SlackThread({ phase }: { phase: number }) {
  // Agent handles the first reply; pushback stays open — human acts via Signals.
  const replyCount = (phase >= 3 ? 1 : 0) + (phase >= 5 ? 1 : 0);

  return (
    <div
      className="overflow-hidden rounded-md border border-foreground-primary/13 bg-background-primary text-foreground-primary shadow-sm"
      style={{
        fontFamily:
          'Lato, Slack-Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="flex h-[49px] items-center justify-between border-b border-border-secondary px-4">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-black tracking-tight">Thread</span>
          <span className="text-[13px] font-bold text-(--label-color-blue)">
            #support
          </span>
        </div>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-foreground-tertiary hover:bg-background-tertiary"
          tabIndex={-1}
          aria-hidden="true"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-col pt-2">
        <SlackMessageSlot
          typing={phase === 0}
          who="jordan"
          visible={phase >= 1}
        >
          <SlackMessage who="jordan" name="Jordan Chen" time="9:41 AM">
            our webhook stopped delivering sometime this morning — orders
            aren&apos;t syncing to our store anymore
          </SlackMessage>
        </SlackMessageSlot>

        <div
          className={cn(
            "flex items-center gap-3 px-5 py-2",
            replyCount === 0 ? "invisible" : "fade-up"
          )}
        >
          <span className="shrink-0 text-[12px] font-bold text-(--label-color-blue)">
            {replyCount || 3} {replyCount === 1 ? "reply" : "replies"}
          </span>
          <div className="h-px flex-1 bg-border-secondary" />
        </div>

        <SlackMessageSlot typing={phase === 2} who="pedro" visible={phase >= 3}>
          <SlackMessage who="pedro" name="Pedro" time="9:41 AM" app>
            Thanks for reporting this. If your signing secret rotated recently,
            your endpoint needs the new value before deliveries resume.
            Here&apos;s how to update it and replay missed events:
            <SlackLink>docs.acme.co/webhooks/signing-secret</SlackLink>
          </SlackMessage>
        </SlackMessageSlot>

        <SlackMessageSlot
          typing={phase === 4}
          who="jordan"
          visible={phase >= 5}
        >
          <SlackMessage who="jordan" name="Jordan Chen" time="9:42 AM">
            updated the secret per the doc, still nothing. got ~40 orders
            sitting in limbo
          </SlackMessage>
        </SlackMessageSlot>

        <div className="px-3 pt-1 pb-3">
          <div className="overflow-hidden rounded-lg border border-border-tertiary shadow-sm">
            <div className="px-3 pt-2.5 pb-1.5 text-[15px] text-foreground-tertiary/60">
              Reply…
            </div>
            <div className="flex items-center justify-between border-t border-border-primary px-1.5 py-1">
              <div className="flex items-center gap-0.5">
                <ComposerIcon label="Aa" />
                <ComposerIcon>
                  <BoldIcon />
                </ComposerIcon>
                <ComposerIcon>
                  <EmojiIcon />
                </ComposerIcon>
                <ComposerIcon>
                  <MentionIcon />
                </ComposerIcon>
                <ComposerIcon>
                  <AttachIcon />
                </ComposerIcon>
              </div>
              <div className="mr-1 flex size-6 items-center justify-center rounded text-foreground-tertiary/40">
                <SendIcon />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlackMessageSlot({
  visible,
  typing,
  who,
  children,
}: {
  visible: boolean;
  typing: boolean;
  who: "jordan" | "pedro";
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className={cn(visible ? "fade-up" : "invisible")}>{children}</div>
      {typing ? (
        <div className="absolute inset-x-0 top-0">
          <SlackTyping who={who} />
        </div>
      ) : null}
    </div>
  );
}

function SlackMessage({
  who,
  name,
  time,
  app,
  children,
}: {
  who: "jordan" | "pedro";
  name: string;
  time: string;
  app?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 px-5 py-2 hover:bg-background-tertiary/60">
      <SlackAvatar who={who} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 leading-none">
          <span className="text-[15px] font-black text-foreground-primary">
            {name}
          </span>
          {app ? (
            <span className="relative -top-px rounded-[2px] bg-foreground-primary/10 px-1 py-px text-[10px] font-bold text-foreground-primary uppercase leading-[14px]">
              APP
            </span>
          ) : null}
          <span className="text-[12px] font-normal text-foreground-tertiary">
            {time}
          </span>
        </div>
        <div className="mt-0.5 text-[15px] leading-[1.466] wrap-break-word text-foreground-secondary">
          {children}
        </div>
      </div>
    </div>
  );
}

function SlackLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-2 flex w-fit max-w-full items-stretch overflow-hidden rounded-md border border-border-secondary bg-background-primary shadow-sm">
      <span className="flex w-10 shrink-0 items-center justify-center border-r border-border-primary bg-background-tertiary text-foreground-tertiary">
        <DocIcon />
      </span>
      <span className="min-w-0 px-3 py-1.5">
        <span className="block truncate text-[13px] leading-tight font-bold text-foreground-primary">
          Rotating your signing secret
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-tight text-(--label-color-blue)">
          {children}
        </span>
      </span>
    </span>
  );
}

function SlackTyping({ who }: { who: "jordan" | "pedro" }) {
  return (
    <div className="fade-up flex items-center gap-2 px-5 py-2">
      <SlackAvatar who={who} />
      <div className="flex items-center gap-[3px] rounded-2xl bg-background-tertiary px-2.5 py-2">
        {[0, 0.18, 0.36].map((d) => (
          <span
            key={d}
            className="size-1.5 rounded-full bg-foreground-tertiary"
            style={{
              animation: "blink 1s ease-in-out infinite",
              animationDelay: `${d}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SlackAvatar({ who }: { who: "jordan" | "pedro" }) {
  if (who === "pedro") {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--label-color-blue) text-[13px] font-bold text-background-primary">
        P
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--label-color-pink) text-[12px] font-bold text-background-primary">
      JC
    </span>
  );
}

function ComposerIcon({
  label,
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className="flex size-7 items-center justify-center rounded text-[13px] font-bold text-foreground-secondary">
      {label ?? children}
    </span>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="text-foreground-tertiary"
    >
      <path
        d="M5.5 5.5l9 9M14.5 5.5l-9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="text-foreground-tertiary"
    >
      <path
        d="M4 2.5h5.5L13 6v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M9.5 2.5V6H13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function BoldIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 3h5.2a2.8 2.8 0 0 1 0 5.6H4V3zm0 5.6h5.8A3 3 0 0 1 9.8 14H4V8.6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="7" r="0.8" fill="currentColor" />
      <circle cx="10" cy="7" r="0.8" fill="currentColor" />
      <path
        d="M5.5 9.5c.8 1.2 2 1.8 2.5 1.8s1.7-.6 2.5-1.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MentionIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10.5 8a2.5 2.5 0 1 1-1.2-2.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M10.5 8v1.2a1.8 1.8 0 0 0 3.2-.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13 7.5l-5.2 5.2a3.2 3.2 0 0 1-4.5-4.5L9.5 2a2.1 2.1 0 0 1 3 3L6.3 11.2a1 1 0 0 1-1.4-1.4L10 4.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 8h11M9 4l4.5 4L9 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
