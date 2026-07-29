/* mirror: Signals page — apps/web/src/routes/app/_workspace/_main/signal/index.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/signal/index.tsx @ 59006b69
 *   why: auth, jotai org, PostHog → ActorContext
 * fork: apps/web/src/components/signals/action-list.tsx @ 59006b69
 *   why: useLiveQuery threads for the feed
 * reuse: CardHeader, CardTitle, CardContent, Greeting, MockSignalCard
 * state: greeting + 3 signals (red reply, orange duplicate bundle, yellow close)
 * marketing: none
 */

import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";

import { Greeting } from "~/components/signals/greeting";

import { SIGNALS, VIEWER } from "./data";
import { MockSignalCard } from "./mock-signal-card";

export function MockSignalsPage() {
  const count = SIGNALS.length;

  return (
    <>
      <CardHeader>
        <CardTitle>Signals</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 overflow-y-auto py-10!">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <Greeting userName={VIEWER.name} />
          <div className="px-1 text-lg text-foreground-primary">
            Here are {count} things that require your attention
          </div>
          <div className="flex flex-col gap-4">
            {SIGNALS.map((signal) => (
              <MockSignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        </div>
      </CardContent>
    </>
  );
}
