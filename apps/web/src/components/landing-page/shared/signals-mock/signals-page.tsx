/* mirror: Signals page — apps/web/src/routes/app/_workspace/_main/signal/index.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/signal/index.tsx @ 59006b69
 *   why: auth, jotai org, PostHog → ActorContext
 * fork: apps/web/src/components/signals/action-list.tsx @ 59006b69
 *   why: useLiveQuery threads for the feed
 * reuse: CardHeader, CardTitle, CardContent, Greeting, MockSignalCard
 * state: greeting + the signals passed in — the hero shows one, section 03
 *   shows three; the count sentence follows the array, as in the real page
 * marketing: optional revealDelayMs holds the feed at its animation start state
 *   (fade-up / pop-in are `both`-filled) so it lands on a hero phase beat.
 *   Omit it and the page renders flat, which is what section 03 wants.
 */

import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";

import { Greeting } from "~/components/signals/greeting";

import { MockSignalCard } from "./mock-signal-card";
import type { MockSignalCardData, MockThreadReference } from "./types";

interface MockSignalsPageProps {
  signals: MockSignalCardData[];
  viewerName: string;
  threadReferences?: Record<string, MockThreadReference>;
  /** When set, the feed animates in after this delay instead of rendering flat. */
  revealDelayMs?: number;
}

export function MockSignalsPage({
  signals,
  viewerName,
  threadReferences,
  revealDelayMs,
}: MockSignalsPageProps) {
  const count = signals.length;
  const revealed = revealDelayMs != null;
  const delay = revealed ? { animationDelay: `${revealDelayMs}ms` } : undefined;

  return (
    <>
      <CardHeader>
        <CardTitle>Signals</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 overflow-y-auto py-10!">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <Greeting userName={viewerName} />
          <div
            className={cn("px-1 text-lg text-foreground-primary", revealed && "fade-up")}
            style={delay}
          >
            {count === 1
              ? "Here's 1 thing that requires your attention"
              : `Here are ${count} things that require your attention`}
          </div>
          <div className="flex flex-col gap-4">
            {signals.map((signal) => (
              <div
                key={signal.id}
                className={revealed ? "pop-in" : undefined}
                style={delay}
              >
                <MockSignalCard
                  signal={signal}
                  threadReferences={threadReferences}
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </>
  );
}
