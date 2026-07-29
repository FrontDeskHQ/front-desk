/* marketing: product-demo slide chrome margins over shared MockThreadsPage */

import type { DemoThread } from "../../../shared/threads-list-mock";
import { MockThreadsPage as SharedMockThreadsPage } from "../../../shared/threads-list-mock";

interface MockThreadsPageProps {
  threads: DemoThread[];
  hoveredThreadId?: string;
}

export const MockThreadsPage = ({
  threads,
  hoveredThreadId,
}: MockThreadsPageProps) => (
  <SharedMockThreadsPage
    threads={threads}
    hoveredThreadId={hoveredThreadId}
    className="relative m-2 ml-0 h-auto flex-1"
  />
);
