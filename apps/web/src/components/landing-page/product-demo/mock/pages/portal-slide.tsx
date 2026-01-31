import type { DemoThread } from "../types";
import { MockPortalPage } from "./portal-page";
import { MockPortalThreadDetailPage } from "./portal-thread-detail-page";

type MockPortalSlideProps = {
  threads: DemoThread[];
  elapsedMs: number;
  slideDurationMs: number;
};

export const MockPortalSlide = ({
  threads,
  elapsedMs,
  slideDurationMs,
}: MockPortalSlideProps) => {
  const selectedThread = threads[1] ?? threads[0];
  if (!selectedThread) return null;

  const listDurationMs = slideDurationMs * 0.4;
  const isListView = elapsedMs < listDurationMs;

  const hoverStartMs = listDurationMs * 0.62;
  const isSimulatedHover = isListView && elapsedMs >= hoverStartMs;

  return (
    <div className="size-full flex flex-col">
      {isListView ? (
        <MockPortalPage
          threads={threads}
          hoveredThreadId={isSimulatedHover ? selectedThread.id : undefined}
        />
      ) : (
        <MockPortalThreadDetailPage thread={selectedThread} />
      )}
    </div>
  );
};
