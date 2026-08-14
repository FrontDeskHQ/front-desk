import { ThreadReadProvider } from "./context";
import { FeedThreadRead } from "./feed";
import { ThreadRead as ThreadReadPieces } from "./pieces";
import { ThreadSurfaceRead } from "./thread-surface";

export type { ThreadWithAgentRead, ThreadWithRelations } from "./context";
export { ThreadReadProvider, useThreadRead } from "./context";
export { FeedThreadRead } from "./feed";
export { ThreadSurfaceRead } from "./thread-surface";

export const ThreadRead = {
  ...ThreadReadPieces,
  Feed: FeedThreadRead,
  Provider: ThreadReadProvider,
  ThreadSurface: ThreadSurfaceRead,
};
