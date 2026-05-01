import type { Job } from "bullmq";
import { safeParseOrgSettings } from "@workspace/schemas/organization";
import {
  computeUrgency,
  signalTypeFromStored,
} from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { fetchClient } from "../lib/database/client";

const SUGGESTION_TYPE_PENDING_REPLY = "digest:pending_reply";
const SUGGESTION_TYPE_LOOP_TO_CLOSE = "digest:loop_to_close";
const SUGGESTION_TYPE_LINKED_PR = "linked_pr";
const OPEN_STATUSES = [0, 1]; // Open, In Progress

type SuggestionRow = {
  id: string;
  type: string;
  entityId: string;
  relatedEntityId: string | null;
  active: boolean;
  accepted: boolean;
  organizationId: string;
  resultsStr: string | null;
  metadataStr: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ThreadRow = {
  id: string;
  organizationId: string;
  status: number;
  deletedAt: Date | string | null;
  externalPrId: string | null;
  messages: Array<{
    id: string;
    authorId: string;
    createdAt: Date | string;
    isBackfill: boolean;
  }>;
};

type AuthorRow = {
  id: string;
  userId: string | null;
  metaId: string | null;
  name: string;
  organizationId: string | null;
};

type OrgRow = {
  id: string;
  settings: unknown;
};

/**
 * Digest scan handler — runs every 5 minutes.
 * Detects pending-reply and loop-to-close conditions, creates digest signals.
 */
export const handleDigestScan = async (_job: Job) => {
  console.log("\n🔍 Digest scan: starting");

  const organizations = (await fetchClient.query.organization.get()) as OrgRow[];

  let totalPendingReply = 0;
  let totalLoopToClose = 0;

  for (const org of organizations) {
    const settings = safeParseOrgSettings(org.settings);
    const thresholdMs =
      settings.digest.pendingReplyThresholdMinutes * 60 * 1000;

    try {
      const result = await scanOrganization(org.id, thresholdMs);
      totalPendingReply += result.pendingReplyCreated;
      totalLoopToClose += result.loopToCloseCreated;
    } catch (error) {
      console.error(`Digest scan failed for org ${org.id}:`, error);
    }
  }

  console.log(
    `🔍 Digest scan complete: ${totalPendingReply} pending-reply, ${totalLoopToClose} loop-to-close signals created`,
  );

  return { totalPendingReply, totalLoopToClose };
};

async function scanOrganization(
  organizationId: string,
  thresholdMs: number,
): Promise<{ pendingReplyCreated: number; loopToCloseCreated: number }> {
  // Fetch open/in-progress threads with messages
  const threads = (await fetchClient.query.thread
    .where({
      organizationId,
      status: { $in: OPEN_STATUSES },
      deletedAt: null,
    })
    .include({ messages: true })
    .get()) as ThreadRow[];

  if (threads.length === 0) {
    return { pendingReplyCreated: 0, loopToCloseCreated: 0 };
  }

  // Fetch existing active digest signals for dedup
  const existingSignals = (await fetchClient.query.suggestion
    .where({
      organizationId,
      type: { $in: [SUGGESTION_TYPE_PENDING_REPLY, SUGGESTION_TYPE_LOOP_TO_CLOSE] },
      active: true,
    })
    .get()) as SuggestionRow[];

  const activeSignalSet = new Set(
    existingSignals.map((s) => `${s.type}:${s.entityId}`),
  );

  // Build author cache to avoid repeated lookups
  const authorIds = new Set<string>();
  for (const thread of threads) {
    for (const msg of thread.messages) {
      authorIds.add(msg.authorId);
    }
  }

  const authorMap = new Map<string, AuthorRow>();
  if (authorIds.size > 0) {
    const authors = (await fetchClient.query.author
      .where({ id: { $in: [...authorIds] } })
      .get()) as AuthorRow[];
    for (const author of authors) {
      authorMap.set(author.id, author);
    }
  }

  // Preload accepted linked_pr suggestions for all candidate threads (avoids N+1)
  const prCandidateThreadIds = threads
    .filter((t) => t.externalPrId)
    .map((t) => t.id);

  const linkedPrMap = new Map<string, SuggestionRow>();
  if (prCandidateThreadIds.length > 0) {
    const linkedPrSuggestions = (await fetchClient.query.suggestion
      .where({
        organizationId,
        type: SUGGESTION_TYPE_LINKED_PR,
        entityId: { $in: prCandidateThreadIds },
        accepted: true,
      })
      .get()) as SuggestionRow[];

    // Key by "threadId:externalPrId" — keep the latest per key
    for (const s of linkedPrSuggestions) {
      const thread = threads.find((t) => t.id === s.entityId);
      if (!thread?.externalPrId) continue;

      // Match suggestion to the thread's current PR via resultsStr
      try {
        const results = s.resultsStr ? JSON.parse(s.resultsStr) : null;
        const suggestionPrRef = results
          ? `github:${results.repo}#${results.prId}`
          : null;
        if (suggestionPrRef !== thread.externalPrId) continue;
      } catch {
        continue;
      }

      const key = `${s.entityId}:${thread.externalPrId}`;
      const existing = linkedPrMap.get(key);
      if (
        !existing ||
        new Date(s.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
      ) {
        linkedPrMap.set(key, s);
      }
    }
  }

  let pendingReplyCreated = 0;
  let loopToCloseCreated = 0;

  for (const thread of threads) {
    // Skip threads with no messages
    if (!thread.messages || thread.messages.length === 0) continue;

    // Skip backfill-only threads
    const hasNonBackfillMessage = thread.messages.some((m) => !m.isBackfill);
    if (!hasNonBackfillMessage) continue;

    // Skip bot-only threads (no external human ever wrote — all authors have userId set or no real participants)
    const hasExternalHuman = thread.messages.some((m) => {
      const author = authorMap.get(m.authorId);
      return author && !author.userId;
    });
    if (!hasExternalHuman) continue;

    // --- Pending reply detection ---
    if (!activeSignalSet.has(`${SUGGESTION_TYPE_PENDING_REPLY}:${thread.id}`)) {
      const sortedMessages = [...thread.messages].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const lastMessage = sortedMessages[0]!;
      const lastAuthor = authorMap.get(lastMessage.authorId);

      // External author (userId is null) and past threshold
      if (lastAuthor && !lastAuthor.userId) {
        const messageAge = Date.now() - new Date(lastMessage.createdAt).getTime();
        if (messageAge > thresholdMs) {
          await createDigestSignal({
            type: SUGGESTION_TYPE_PENDING_REPLY,
            threadId: thread.id,
            organizationId,
            resultsStr: JSON.stringify({
              detectedAt: new Date().toISOString(),
              lastMessageAt: new Date(lastMessage.createdAt).toISOString(),
              thresholdMinutes: thresholdMs / 60_000,
            }),
          });
          pendingReplyCreated++;
        }
      }
    }

    // --- Loop to close detection ---
    if (
      thread.externalPrId &&
      !activeSignalSet.has(`${SUGGESTION_TYPE_LOOP_TO_CLOSE}:${thread.id}`)
    ) {
      const key = `${thread.id}:${thread.externalPrId}`;
      const linkedPrSuggestion = linkedPrMap.get(key);

      if (linkedPrSuggestion) {
        const linkedAt = new Date(linkedPrSuggestion.updatedAt).getTime();

        // Check if any internal author posted after the PR was linked
        const hasAgentReplyAfterLink = thread.messages.some((m) => {
          const author = authorMap.get(m.authorId);
          return (
            author?.userId &&
            new Date(m.createdAt).getTime() > linkedAt
          );
        });

        if (!hasAgentReplyAfterLink) {
          const prMergedAt = new Date(linkedPrSuggestion.updatedAt).toISOString();

          await createDigestSignal({
            type: SUGGESTION_TYPE_LOOP_TO_CLOSE,
            threadId: thread.id,
            organizationId,
            resultsStr: JSON.stringify({
              detectedAt: new Date().toISOString(),
              linkedPrId: thread.externalPrId,
              prMergedAt,
            }),
          });
          loopToCloseCreated++;
        }
      }
    }
  }

  return { pendingReplyCreated, loopToCloseCreated };
}

async function createDigestSignal(params: {
  type: string;
  threadId: string;
  organizationId: string;
  resultsStr: string;
}): Promise<void> {
  const now = new Date();
  const normalizedType = signalTypeFromStored(params.type);
  await fetchClient.mutate.suggestion.insert({
    id: ulid().toLowerCase(),
    type: params.type,
    entityId: params.threadId,
    relatedEntityId: null,
    organizationId: params.organizationId,
    active: true,
    accepted: false,
    resultsStr: params.resultsStr,
    metadataStr: JSON.stringify({ digestIncludedAt: [] }),
    urgencyScore: normalizedType
      ? computeUrgency({ signalType: normalizedType, ageHours: 0 })
      : 0,
    createdAt: now,
    updatedAt: now,
  });
}
