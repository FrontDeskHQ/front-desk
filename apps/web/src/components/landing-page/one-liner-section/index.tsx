import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";

import { FrontDeskApp } from "./mock/front-desk-app";

/**
 * Landing hero — one-liner + dual mocks.
 * Top: the one-liner. Below: FrontDesk UI (full-width 16:9) with the
 * Slack thread floating over the bottom-right corner. Both share the same
 * phase script:
 *   01 picks up      → a message lands (thread view)
 *   02 replies       → Agent replies in Pedro's voice (thread view)
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
      className="col-span-full flex w-full justify-center bg-background-primary px-6 pt-50 pb-16 text-foreground-primary scroll-mt-15"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap');
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp .4s ease-out both; }
        @keyframes blink { 0%,100% { opacity:.25; } 50% { opacity:1; } }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: none; }
        }
        .pop-in { animation: popIn .5s cubic-bezier(0.23, 1, 0.32, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .fade-up, .pop-in { animation: none; }
        }
      `}</style>

      <div className="flex w-full flex-col gap-30">
        {/* ---------- HERO COPY ---------- */}
        <div className="flex w-full flex-col gap-8 max-w-2xl">
          <h1 className="text-4xl leading-tight font-medium tracking-tight md:text-5xl">
            Care for every customer.
            <br />
            Even when you can&apos;t keep up.
          </h1>
          <div className="flex flex-col gap-8">
            <h2 className="text-2xl leading-tight font-light tracking-tight text-foreground-primary/45 transition-colors md:text-[1.75rem]">
              <Part active={hl === 0}>
                FrontDesk picks up every conversation,
              </Part>{" "}
              <Part active={hl === 1}>replies in your voice,</Part>{" "}
              <Part active={hl === 2}>
                and pulls you in only when it matters
              </Part>
              .
            </h2>
            <Button
              size="xl"
              className="w-fit bg-primary text-primary-foreground hover:bg-primary/90"
              render={
                <a
                  href="mailto:hello@tryfrontdesk.app?subject=Early%20access"
                  aria-label="Request early access"
                />
              }
            >
              Request early access
            </Button>
          </div>

          {/* <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {[
              "Nothing waits on you",
              "Care, automated",
              "You stay in control",
            ].map((tag, i) => (
              <div key={tag} className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono transition-colors",
                    hl === i
                      ? "text-foreground-primary"
                      : "text-foreground-tertiary/60",
                  )}
                >
                  {`0${i + 1}`}
                </span>
                <span
                  className={cn(
                    "transition-colors",
                    hl === i
                      ? "text-foreground-secondary"
                      : "text-foreground-tertiary/50",
                  )}
                >
                  {tag}
                </span>
              </div>
            ))}
          </div> */}
        </div>

        {/* ---------- MOCKS: FrontDesk full-bleed, Slack floating ---------- */}
        <div className="relative w-full">
          <FrontDeskApp phase={phase} page={hl < 2 ? "threads" : "signals"} />
          <div className="pointer-events-none absolute right-4 bottom-4 z-10 w-[min(100%-2rem,22rem)] shadow-2xl sm:right-6 sm:bottom-6 sm:w-96 md:w-[26rem]">
            <SlackThread phase={phase} />
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

/** High-fidelity Slack thread panel — app color tokens, Slack layout. */
function SlackThread({ phase }: { phase: number }) {
  // Agent handles the first reply; pushback stays open — human acts via Signals.
  const replyCount = (phase >= 3 ? 1 : 0) + (phase >= 5 ? 1 : 0);

  return (
    <div
      className="overflow-hidden rounded-md border border-border-secondary bg-background-primary text-foreground-primary shadow-sm"
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
            Hey — our webhook stopped firing this morning and orders aren&apos;t
            syncing 😕
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
            Thanks for flagging! That usually means your signing secret rotated.
            Here&apos;s how to update it and replay the missed events:
            <SlackLink>docs.acme.co/webhooks/signing-secret</SlackLink>
          </SlackMessage>
        </SlackMessageSlot>

        <SlackMessageSlot
          typing={phase === 4}
          who="jordan"
          visible={phase >= 5}
        >
          <SlackMessage who="jordan" name="Jordan Chen" time="9:42 AM">
            Tried that — still nothing, and orders are piling up. If this
            isn&apos;t fixed today we&apos;ll have to move off the product.
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
