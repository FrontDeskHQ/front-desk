/**
 * Queue contract for "Import threads". The API enqueues one job per support
 * integration; the connector for that provider owns the worker
 * (`runtime/thread-import.ts`). Shared here so both sides agree on the queue
 * name and job id without depending on each other.
 */
export interface ThreadImportJobData {
  integrationId: string;
  /** The `threadImportRun` row this job reports progress to. */
  runId: string;
  /** Channels to import from, as stored in the integration's
   * `selectedChannels` (Slack channel id, Discord channel name). Always a
   * subset of them: the API rejects anything else. */
  channelIds: string[];
}

export const threadImportQueueName = (provider: string): string =>
  `${provider}-thread-import`;

/**
 * One job id per integration, so a second click while an import is queued or
 * running coalesces onto it. BullMQ rejects `:` in custom ids.
 */
export const threadImportJobId = (integrationId: string): string =>
  `import_${integrationId}`;
