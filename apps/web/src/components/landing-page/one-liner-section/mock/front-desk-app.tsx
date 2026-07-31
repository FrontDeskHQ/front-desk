/* rebuild: marketing composition — the hero's page switch, no mirrored UI of
 *   its own beyond what it wires together
 * reuse: ProductMockFrame, MockSignalsPage, Card, ThreadPage
 * state: thread view (phases 01/02) or Signals (phase 03)
 * marketing: page and aria-label both follow the phase script. The signal feed
 *   gets revealDelayMs so it pops in on a beat after the Signals page swaps in
 *   — a CSS animation-delay, not a timer, so remounting can't desync it.
 */

import { Card } from "@workspace/ui/components/card";

import {
  MOCK_MAIN_CARD_CLASS,
  ProductMockFrame,
} from "../../shared/app-chrome";
import { MockSignalsPage } from "../../shared/signals-mock";
import { HERO_SIGNALS, VIEWER } from "./data";
import { ThreadPage } from "./thread-page";
import type { FrontDeskPage } from "./types";

/** Beat the signal lands on, after the Signals page swaps in. */
const SIGNAL_REVEAL_MS = 700;

interface FrontDeskAppProps {
  phase: number;
  page: FrontDeskPage;
}

export function FrontDeskApp({ phase, page }: FrontDeskAppProps) {
  return (
    <ProductMockFrame
      activeSidebarItem={page}
      frameClassName="border-foreground-primary/13"
      ariaLabel={
        page === "signals"
          ? "FrontDesk Signals, showing one high-urgency thread that needs a human reply"
          : "FrontDesk thread view, showing an open webhook support conversation"
      }
    >
      <Card className={MOCK_MAIN_CARD_CLASS}>
        {page === "signals" ? (
          <MockSignalsPage
            signals={HERO_SIGNALS}
            viewerName={VIEWER.name}
            revealDelayMs={SIGNAL_REVEAL_MS}
          />
        ) : (
          <ThreadPage phase={phase} />
        )}
      </Card>
    </ProductMockFrame>
  );
}
