import type { DemoThread } from "../types";
import { MockThreadDetailPage } from "./thread-detail-page";
import { MockThreadsPage } from "./threads-page";

type MockThreadsSlideProps = {
  threads: DemoThread[];
  elapsedMs: number;
  slideDurationMs: number;
};

export const MockThreadsSlide = ({
  threads,
  elapsedMs,
  slideDurationMs,
}: MockThreadsSlideProps) => {
  const selectedThread = threads[0];
  if (!selectedThread) return null;

  const listDurationMs = slideDurationMs * 0.4;
  const isListView = elapsedMs < listDurationMs;

  const hoverStartMs = listDurationMs * 0.62;
  const isSimulatedHover = isListView && elapsedMs >= hoverStartMs;

  return (
    <div className="size-full flex flex-col">
      {isListView ? (
        <MockThreadsPage
          threads={threads}
          hoveredThreadId={isSimulatedHover ? selectedThread.id : undefined}
        />
      ) : (
        <MockThreadDetailPage thread={selectedThread} />
      )}
    </div>
  );
};
