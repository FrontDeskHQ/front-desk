/* rebuild: marketing composition — section 02's visual band, no mirrored UI of
 *   its own beyond what it wires together
 * reuse: ProductMockFrame, MockThreadDetailPage, Card
 * state: billing refund thread In progress, assigned to Pedro; SI tab open with Draft Reply
 * marketing: radial bottom mask — center bottom edge stays visible, corners fade;
 *   layout="static" — no phase script here, so hidden slots are omitted rather
 *   than held as invisible placeholders
 */

import { Card } from "@workspace/ui/components/card";

import { MOCK_MAIN_CARD_CLASS, ProductMockFrame } from "../shared/app-chrome";
import { MockThreadDetailPage } from "../shared/thread-detail-mock";

import { CUSTOMER_MESSAGE, SI_DRAFT, SI_MESSAGES, THREAD } from "./data";

export function ThreadDetailVisual() {
  return (
    <div
      className="relative"
      style={{
        maskImage:
          "radial-gradient(ellipse 58% 185% at 50% 100%, black 44%, transparent 92%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 58% 185% at 50% 100%, black 44%, transparent 92%)",
      }}
    >
      <ProductMockFrame
        activeSidebarItem={null}
        ariaLabel="FrontDesk thread view with Support Intelligence drafting a refund reply for a duplicate billing charge"
      >
        <Card className={MOCK_MAIN_CARD_CLASS}>
          <MockThreadDetailPage
            layout="static"
            thread={THREAD}
            headerMessage={CUSTOMER_MESSAGE}
            replies={[]}
            repliesHeadingVisible={false}
            toolbarMode="support-intelligence"
            siDraft={SI_DRAFT}
            siMessages={SI_MESSAGES}
          />
        </Card>
      </ProductMockFrame>
    </div>
  );
}
