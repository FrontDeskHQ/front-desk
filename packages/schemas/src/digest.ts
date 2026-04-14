import { z } from "zod";

export const digestMetricsSchema = z.object({
  newThreads: z.number(),
  resolved: z.number(),
  currentlyOpen: z.number(),
});

export const digestPendingReplyItemSchema = z.object({
  threadId: z.string(),
  threadName: z.string(),
  customerName: z.string(),
  waitTimeMs: z.number().nonnegative(),
});

export const digestLoopToCloseItemSchema = z.object({
  threadId: z.string(),
  threadName: z.string(),
  linkedPrId: z.string(),
  prDisplayName: z.string(),
  timeSinceMergeMs: z.number().nonnegative(),
});

export const digestPayloadSchema = z.object({
  orgName: z.string(),
  orgSlug: z.string(),
  metrics: digestMetricsSchema,
  pendingReply: z.array(digestPendingReplyItemSchema),
  loopToClose: z.array(digestLoopToCloseItemSchema),
});

export const digestNotifyJobDataSchema = z.object({
  orgId: z.string().min(1),
  teamId: z.string().min(1),
  channelId: z.string().min(1),
  payload: digestPayloadSchema,
});

export type DigestMetrics = z.infer<typeof digestMetricsSchema>;
export type DigestPendingReplyItem = z.infer<typeof digestPendingReplyItemSchema>;
export type DigestLoopToCloseItem = z.infer<typeof digestLoopToCloseItemSchema>;
export type DigestPayload = z.infer<typeof digestPayloadSchema>;
export type DigestNotifyJobData = z.infer<typeof digestNotifyJobDataSchema>;
