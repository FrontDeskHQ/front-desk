import { ActionRow } from "../action-row";
import type { ActorContext } from "../handlers";
import { ThreadReadProvider, useThreadRead } from "./context";
import type { ThreadWithAgentRead } from "./context";
import { ThreadRead } from "./pieces";

function ThreadSurfaceHeader({ onClose }: { onClose: () => void }) {
  return (
    <ThreadRead.SurfaceHeader
      trailing={
        <>
          <ThreadRead.Reasoning />
          <ActionRow.Dismiss onClick={onClose} label="Close" />
        </>
      }
    >
      <ThreadRead.Summary />
      <ThreadRead.Recommendation />
      <ThreadRead.InlineSuggestions className="py-1" />
    </ThreadRead.SurfaceHeader>
  );
}

function ThreadSurfaceLeadingActions() {
  const { state } = useThreadRead();
  return (
    <>
      {state.read.createdAt ? (
        <div className="mr-auto">
          <ThreadRead.Timestamp />
        </div>
      ) : null}
      <ThreadRead.DismissRead />
    </>
  );
}

export function ThreadSurfaceRead({
  thread,
  ctx,
  onClose,
}: {
  thread: ThreadWithAgentRead;
  ctx: ActorContext;
  onClose: () => void;
}) {
  return (
    <ThreadReadProvider thread={thread} ctx={ctx}>
      <ThreadRead.Root>
        <ActionRow.Header>
          <ThreadSurfaceHeader onClose={onClose} />
        </ActionRow.Header>
        <ThreadRead.ReplyEditor />
        <ActionRow.Actions>
          <ThreadSurfaceLeadingActions />
          <ThreadRead.FooterActions />
        </ActionRow.Actions>
      </ThreadRead.Root>
    </ThreadReadProvider>
  );
}
