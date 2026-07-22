import { z } from "zod";

export const digestMetricsSchema = z.object({
  currentlyOpen: z.number(),
  newThreads: z.number(),
  resolved: z.number(),
});

export const digestPendingReplyItemSchema = z.object({
  customerName: z.string(),
  threadId: z.string(),
  threadName: z.string(),
  waitTimeMs: z.number().nonnegative(),
});

export const digestLoopToCloseItemSchema = z.object({
  linkedPrId: z.string(),
  prDisplayName: z.string(),
  threadId: z.string(),
  threadName: z.string(),
  timeSinceMergeMs: z.number().nonnegative(),
});

export const digestPayloadSchema = z.object({
  loopToClose: z.array(digestLoopToCloseItemSchema),
  metrics: digestMetricsSchema,
  orgName: z.string(),
  orgSlug: z.string(),
  pendingReply: z.array(digestPendingReplyItemSchema),
});

export const digestNotifyJobDataSchema = z.object({
  channelId: z.string().min(1),
  orgId: z.string().min(1),
  payload: digestPayloadSchema,
  teamId: z.string().min(1),
});

export type DigestMetrics = z.infer<typeof digestMetricsSchema>;
export type DigestPendingReplyItem = z.infer<
  typeof digestPendingReplyItemSchema
>;
export type DigestLoopToCloseItem = z.infer<typeof digestLoopToCloseItemSchema>;
export type DigestPayload = z.infer<typeof digestPayloadSchema>;
export type DigestNotifyJobData = z.infer<typeof digestNotifyJobDataSchema>;
