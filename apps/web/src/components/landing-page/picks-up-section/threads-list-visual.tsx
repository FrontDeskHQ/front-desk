/* rebuild: marketing composition — section 01's visual band, no mirrored UI of
 *   its own beyond what it wires together
 * reuse: ProductMockFrame, MockThreadsPage, demoThreads
 * state: full demoThreads inbox in workspace chrome — Threads / Open active
 * marketing: none beyond ProductMockFrame's canvas and inert wrapper
 */

import { MOCK_MAIN_CARD_CLASS, ProductMockFrame } from "../shared/app-chrome";
import { MockThreadsPage, demoThreads } from "../shared/threads-list-mock";

export function ThreadsListVisual() {
  return (
    <ProductMockFrame
      activeSidebarItem="threads"
      ariaLabel="FrontDesk app showing the threads inbox with eighteen open conversations from Slack, Discord, email, and GitHub"
    >
      <MockThreadsPage threads={demoThreads} className={MOCK_MAIN_CARD_CLASS} />
    </ProductMockFrame>
  );
}
