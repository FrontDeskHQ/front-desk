export type DigestMetrics = {
  newThreads: number;
  resolved: number;
  currentlyOpen: number;
};

export type DigestPendingReplyItem = {
  threadId: string;
  threadName: string;
  customerName: string;
  waitTimeMs: number;
};

export type DigestLoopToCloseItem = {
  threadId: string;
  threadName: string;
  linkedPrId: string;
  prDisplayName: string;
  timeSinceMergeMs: number;
};

export type DigestPayload = {
  orgName: string;
  orgSlug: string;
  metrics: DigestMetrics;
  pendingReply: DigestPendingReplyItem[];
  loopToClose: DigestLoopToCloseItem[];
};

export type DigestNotifyJobData = {
  orgId: string;
  teamId: string;
  channelId: string;
  payload: DigestPayload;
};
