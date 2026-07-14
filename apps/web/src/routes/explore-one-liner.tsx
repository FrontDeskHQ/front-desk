import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/explore-one-liner")({
  component: RouteComponent,
});

/**
 * TEMP exploration — base version.
 * Left: the one-liner. Right: a high-fidelity Slack thread that auto-plays
 * a real scenario. The active part of the sentence highlights as the story moves:
 *   01 picks up      → a message lands in #support
 *   02 replies       → Pedro (APP) — FrontDesk sending as you
 *   03 pulls you in  → customer pushes back → you jump in personally
 */

/* Scripted phases. `hl` = which sentence part is lit (0/1/2). */
const PHASES = [
  { hl: 0, dur: 900 }, //  customer typing
  { hl: 0, dur: 1300 }, // customer message (from Slack)
  { hl: 1, dur: 1100 }, // Agent typing
  { hl: 1, dur: 2400 }, // Agent doc-based reply
  { hl: 2, dur: 900 }, //  customer typing again
  { hl: 2, dur: 2000 }, // churn-risk reply
  { hl: 2, dur: 2800 }, // human pulled in
  { hl: 2, dur: 1200 }, // hold, then loop
] as const;

function RouteComponent() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setTimeout(
      () => setPhase((p) => (p + 1) % PHASES.length),
      PHASES[phase].dur,
    );
    return () => clearTimeout(t);
  }, [phase]);

  const hl = PHASES[phase].hl;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background-primary px-6 py-16 text-foreground-primary">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap');
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp .4s ease-out both; }
        @keyframes blink { 0%,100% { opacity:.25; } 50% { opacity:1; } }
      `}</style>

      <div className="grid w-full max-w-6xl items-center gap-12 md:grid-cols-2 lg:gap-20">
        {/* ---------- LEFT: the one-liner ---------- */}
        <div>
          <p className="font-mono text-xs text-foreground-tertiary">FrontDesk</p>
          <h1 className="mt-4 text-3xl leading-tight font-light tracking-tight md:text-[2.75rem]">
            <Part active={hl === 0}>picks up</Part> every conversation,{" "}
            <Part active={hl === 1}>replies in your voice</Part>, and{" "}
            <Part active={hl === 2}>pulls you in</Part> only when it matters.
          </h1>

          {/* stage ticks — reinforce, don't hide */}
          <div className="mt-8 flex gap-6 text-xs">
            {["Nothing waits on you", "Care, automated", "You stay in control"].map(
              (tag, i) => (
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
              ),
            )}
          </div>
        </div>

        {/* ---------- RIGHT: Slack thread mock ---------- */}
        <SlackThread phase={phase} />
      </div>
    </main>
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
        "font-medium transition-colors duration-300",
        active ? "text-foreground-primary" : "text-foreground-tertiary/45",
      )}
    >
      {children}
    </span>
  );
}

/** High-fidelity Slack thread panel — app color tokens, Slack layout. */
function SlackThread({ phase }: { phase: number }) {
  const replyCount =
    (phase >= 3 ? 1 : 0) + (phase >= 5 ? 1 : 0) + (phase >= 6 ? 1 : 0);

  return (
    <div
      className="overflow-hidden rounded-xl border border-border-secondary bg-background-primary text-foreground-primary shadow-sm"
      style={{
        fontFamily:
          'Lato, Slack-Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Thread header — matches Slack's side panel */}
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

      {/* Messages — all slots always mounted so height stays stable */}
      <div className="flex flex-col pt-2">
        {/* Parent message */}
        <MessageSlot typing={phase === 0} who="jordan" visible={phase >= 1}>
          <SlackMessage who="jordan" name="Jordan Chen" time="9:41 AM">
            Hey — our webhook stopped firing this morning and orders aren&apos;t
            syncing 😕
          </SlackMessage>
        </MessageSlot>

        {/* Reply divider — reserved even before first reply */}
        <div
          className={cn(
            "flex items-center gap-3 px-5 py-2",
            replyCount === 0 ? "invisible" : "fade-up",
          )}
        >
          <span className="shrink-0 text-[12px] font-bold text-(--label-color-blue)">
            {replyCount || 3} {replyCount === 1 ? "reply" : "replies"}
          </span>
          <div className="h-px flex-1 bg-border-secondary" />
        </div>

        {/* Reply 1 — Pedro doc reply */}
        <MessageSlot typing={phase === 2} who="pedro" visible={phase >= 3}>
          <SlackMessage who="pedro" name="Pedro" time="9:41 AM" app>
            Thanks for flagging! That usually means your signing secret
            rotated. Here&apos;s how to update it and replay the missed events:
            <SlackLink>docs.acme.co/webhooks/signing-secret</SlackLink>
          </SlackMessage>
        </MessageSlot>

        {/* Reply 2 — customer pushback */}
        <MessageSlot typing={phase === 4} who="jordan" visible={phase >= 5}>
          <SlackMessage who="jordan" name="Jordan Chen" time="9:42 AM">
            Tried that — still nothing, and orders are piling up. If this
            isn&apos;t fixed today we&apos;ll have to move off the product.
          </SlackMessage>
        </MessageSlot>

        {/* Reply 3 — Pedro jumps in */}
        <MessageSlot typing={false} who="pedro" visible={phase >= 6}>
          <SlackMessage who="pedro" name="Pedro" time="9:42 AM" app>
            Got it — this needs a closer look. Digging into the webhook logs
            now; I&apos;ll follow up shortly.
          </SlackMessage>
        </MessageSlot>

        {/* Composer */}
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

/** Keeps message height reserved; overlays typing while waiting. */
function MessageSlot({
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
      {typing && (
        <div className="absolute inset-x-0 top-0">
          <SlackTyping who={who} />
        </div>
      )}
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
          {app && (
            <span className="relative -top-px rounded-[2px] bg-foreground-primary/10 px-1 py-px text-[10px] font-bold text-foreground-primary uppercase leading-[14px]">
              APP
            </span>
          )}
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
