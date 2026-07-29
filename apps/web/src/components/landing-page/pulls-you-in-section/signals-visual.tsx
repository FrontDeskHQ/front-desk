/* rebuild: marketing composition — section 03's visual band, no mirrored UI of
 *   its own beyond what it wires together
 * reuse: ProductMockFrame, MockSignalsPage, Card
 * state: Signals nav active; 3 mixed-urgency reads (reply, duplicate bundle, close)
 * marketing: no revealDelayMs — the feed renders flat here; only the hero animates
 */

import { Card } from "@workspace/ui/components/card";

import { MOCK_MAIN_CARD_CLASS, ProductMockFrame } from "../shared/app-chrome";
import { MockSignalsPage } from "../shared/signals-mock";

import { SIGNALS, THREAD_REFERENCES, VIEWER } from "./signals-data";

export function SignalsVisual() {
  return (
    <ProductMockFrame
      activeSidebarItem="signals"
      ariaLabel="FrontDesk Signals page showing three items that need attention: a churn-risk webhook thread, a duplicate rate-limit report, and an SSO issue ready to close"
    >
      <Card className={MOCK_MAIN_CARD_CLASS}>
        <MockSignalsPage
          signals={SIGNALS}
          viewerName={VIEWER.name}
          threadReferences={THREAD_REFERENCES}
        />
      </Card>
    </ProductMockFrame>
  );
}
