/* rebuild: marketing composition — binds the hero's phase number to the shared
 *   thread mirror; the mirror header lives on MockThreadDetailPage
 * reuse: MockThreadDetailPage, MESSAGES (shared/thread-detail-mock)
 * state: webhook thread; customer msg → Agent reply → churn pushback → human
 * marketing: phase-gated reveal via layout="scripted" so hidden replies keep
 *   their space and the page never reflows; Churn risk label after pushback
 */

import {
  MESSAGES,
  MockThreadDetailPage,
} from "../../shared/thread-detail-mock";
import { threadStateForPhase } from "./data";

interface ThreadPageProps {
  phase: number;
}

export function ThreadPage({ phase }: ThreadPageProps) {
  return (
    <MockThreadDetailPage
      layout="scripted"
      thread={threadStateForPhase(phase)}
      headerMessage={MESSAGES.customer}
      headerVisible={phase >= 1}
      repliesHeadingVisible={phase >= 3}
      replies={[
        { message: MESSAGES.agent, visible: phase >= 3 },
        { message: MESSAGES.pushback, visible: phase >= 5 },
        { message: MESSAGES.human, visible: phase >= 6 },
      ]}
    />
  );
}
