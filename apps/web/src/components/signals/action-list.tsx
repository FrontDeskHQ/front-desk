// TODO(signals-overhaul issue 10): rewrite against thread.agentRead /
// thread.inlineSuggestions. The suggestion table was dropped in issue 02;
// this feed component is stubbed (always renders the empty state) until then.

import type { ActorContext } from "~/components/signals/action-row";
import { CaughtUpEmpty, NewOrgEmpty } from "~/components/signals/empty-states";

type Props = {
  organizationId: string;
  ctx: ActorContext;
  isNewOrg?: boolean;
};

export function ActionList({ isNewOrg }: Props) {
  return isNewOrg ? <NewOrgEmpty /> : <CaughtUpEmpty />;
}
