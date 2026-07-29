/* mirror: Signals page — apps/web/src/routes/app/_workspace/_main/signal/index.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/signal/index.tsx @ 59006b69
 *   why: auth, jotai org, PostHog → ActorContext
 * fork: apps/web/src/components/signals/action-list.tsx @ 59006b69
 *   why: useLiveQuery threads for the feed
 * reuse: CardHeader, CardTitle, CardContent, Greeting, MockSignalCard
 * state: greeting + 1 red-tier signal requiring attention
 * marketing: 700ms delay then pop-in on the signal card
 */

import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { useEffect, useState } from "react";

import { Greeting } from "~/components/signals/greeting";

import { VIEWER } from "./data";
import { MockSignalCard } from "./mock-signal-card";

export function SignalsPage() {
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowCard(true), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <CardHeader>
        <CardTitle>Signals</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 overflow-y-auto py-10!">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <Greeting userName={VIEWER.name} />
          {showCard ? (
            <>
              <div className="fade-up px-1 text-lg text-foreground-primary">
                Here&apos;s 1 thing that requires your attention
              </div>
              <div className="flex flex-col gap-4">
                <div className="pop-in">
                  <MockSignalCard />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </CardContent>
    </>
  );
}
