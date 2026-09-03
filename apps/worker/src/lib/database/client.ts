import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import { log } from "@workspace/utils/logging";
import type { Router } from "api/router";
import { schema } from "api/schema";

import type { Thread } from "../../types";
import { errorFields, sanitizeUrl } from "../logging";

/**
 * Fetch client for database operations
 */
export const fetchClient = createFetchClient<Router>({
  credentials: async () => ({
    "x-discord-bot-key": process.env.DISCORD_BOT_KEY ?? "",
  }),
  schema,
  url: process.env.LIVE_STATE_API_URL ?? "http://localhost:3333/api/ls",
});

/**
 * Fetch a thread with its messages and labels
 */
export const fetchThreadWithRelations = async (
  threadId: string
): Promise<Thread | null> => {
  try {
    const threads = await fetchClient.query.thread.byIds({ ids: [threadId] });

    const thread = threads[0];
    return (thread as Thread) ?? null;
  } catch (error) {
    log.error({
      action: "worker.database",
      operation: "thread.fetch",
      threadId,
      error: errorFields(error),
    });
    return null;
  }
};

/**
 * A mirrored pull request as returned by the API's `prByUrl` query — the
 * depth-verification payload for synthesis' `read_pr` tool (FRO-204).
 */
export type MirroredPr = NonNullable<
  Awaited<ReturnType<typeof fetchClient.query.externalEntity.prByUrl>>
>;

/**
 * Fetch a single mirrored pull request by its canonical URL, scoped to the org.
 * Returns null when the PR was never mirrored (or has been soft-deleted).
 */
export const fetchMirroredPrByUrl = async (
  organizationId: string,
  url: string
): Promise<MirroredPr | null> => {
  try {
    return await fetchClient.query.externalEntity.prByUrl({
      organizationId,
      url,
    });
  } catch (error) {
    log.error({
      action: "worker.database",
      operation: "pull_request.fetch",
      organizationId,
      url: sanitizeUrl(url),
      error: errorFields(error),
    });
    return null;
  }
};

/**
 * A mirrored external issue as returned by the API's `issueByUrl` query — the
 * depth-verification payload for synthesis' `read_issue` tool.
 */
export type MirroredIssue = NonNullable<
  Awaited<ReturnType<typeof fetchClient.query.externalEntity.issueByUrl>>
>;

/**
 * Fetch a single mirrored issue by its canonical URL, scoped to the org.
 * Returns null when the issue was never mirrored (or has been soft-deleted).
 */
export const fetchMirroredIssueByUrl = async (
  organizationId: string,
  url: string
): Promise<MirroredIssue | null> => {
  try {
    return await fetchClient.query.externalEntity.issueByUrl({
      organizationId,
      url,
    });
  } catch (error) {
    log.error({
      action: "worker.database",
      operation: "issue.fetch",
      organizationId,
      url: sanitizeUrl(url),
      error: errorFields(error),
    });
    return null;
  }
};

/** Read a provider-verified structural outcome for a mirrored external entity. */
export const fetchExternalEntityOutcome = async (
  organizationId: string,
  externalKey: string
) => {
  try {
    return await fetchClient.query.externalEntity.readOutcome({
      externalKey,
      organizationId,
    });
  } catch (error) {
    log.error({
      action: "worker.database",
      operation: "external_entity.outcome",
      organizationId,
      externalKey,
      error: errorFields(error),
    });
    return { status: "unavailable" as const };
  }
};
