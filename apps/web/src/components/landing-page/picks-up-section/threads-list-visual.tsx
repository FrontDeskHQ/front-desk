/* rebuild: marketing composition — section 01's visual band, no mirrored UI of
 *   its own beyond what it wires together
 * reuse: ProductMockFrame, MockThreadsPage, demoThreads
 * state: full demoThreads inbox in workspace chrome — Threads / Open active
 * marketing: bottom mask fades the whole mock (border, shadow, content) out
 */

import { MOCK_MAIN_CARD_CLASS, ProductMockFrame } from "../shared/app-chrome";
import { MockThreadsPage, demoThreads } from "../shared/threads-list-mock";

export function ThreadsListVisual() {
  return (
    <div
      className="relative"
      style={{
        maskImage:
          "linear-gradient(to bottom, black 0%, black 42%, transparent 88%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 0%, black 42%, transparent 88%)",
      }}
    >
      <ProductMockFrame
        activeSidebarItem="threads"
        ariaLabel="FrontDesk app showing the threads inbox with eighteen open conversations from Slack, Discord, email, and GitHub"
      >
        <MockThreadsPage threads={demoThreads} className={MOCK_MAIN_CARD_CLASS} />
      </ProductMockFrame>
    </div>
  );
}
