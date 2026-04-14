import type {
  DigestLoopToCloseItem,
  DigestNotifyJobData,
  DigestPayload,
  DigestPendingReplyItem,
} from "@workspace/schemas/digest";
import { safeParseOrgSettings } from "@workspace/schemas/organization";
import type { Job, Queue } from "bullmq";
import { fetchClient } from "../lib/database/client";

const SUGGESTION_TYPE_PENDING_REPLY = "digest:pending_reply";
const SUGGESTION_TYPE_LOOP_TO_CLOSE = "digest:loop_to_close";
const OPEN_STATUSES = [0, 1];
const RESOLVED_STATUSES = [2, 3, 4];

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  settings: unknown;
};

type ThreadRow = {
  id: string;
  name: string;
  authorId: string;
  status: number;
  createdAt: Date | string;
  deletedAt: Date | string | null;
};

type SuggestionRow = {
  id: string;
  type: string;
  entityId: string;
  active: boolean;
  organizationId: string;
  resultsStr: string | null;
  metadataStr: string | null;
};

type AuthorRow = {
  id: string;
  name: string;
  userId: string | null;
};

type IntegrationRow = {
  id: string;
  organizationId: string;
  type: string;
  enabled: boolean;
  configStr: string | null;
};

type UpdateRow = {
  id: string;
  threadId: string;
  type: string;
  createdAt: Date | string;
  metadataStr: string | null;
};

let notifyQueue: Queue<DigestNotifyJobData> | null = null;

export const setDigestNotifyQueue = (queue: Queue<DigestNotifyJobData>) => {
  notifyQueue = queue;
};

export const handleDigestDeliver = async (job: Job) => {
  const forceOrgId = job.data?.forceOrgId as string | undefined;
  console.log(
    forceOrgId
      ? `\n📬 Digest deliver: force for org ${forceOrgId}`
      : "\n📬 Digest deliver: starting",
  );

  if (!notifyQueue) {
    console.error("Digest deliver: notify queue not initialized");
    return { sent: 0, skipped: 0 };
  }

  const organizations =
    (await fetchClient.query.organization.get()) as OrgRow[];

  let sent = 0;
  let skipped = 0;

  for (const org of organizations) {
    if (forceOrgId && org.id !== forceOrgId) continue;

    try {
      const result = await processOrganization(org, notifyQueue, !!forceOrgId);
      if (result) {
        sent++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`Digest deliver failed for org ${org.id}:`, error);
      skipped++;
    }
  }

  console.log(`📬 Digest deliver complete: ${sent} sent, ${skipped} skipped`);

  return { sent, skipped };
};

async function processOrganization(
  org: OrgRow,
  queue: Queue<DigestNotifyJobData>,
  force = false,
): Promise<boolean> {
  const tag = `[digest ${org.slug}]`;
  const settings = safeParseOrgSettings(org.settings);

  const channelRef =
    settings.digest.slackChannelId ??
    (settings.digest.slackChannelName
      ? settings.digest.slackChannelName.startsWith("#")
        ? settings.digest.slackChannelName
        : `#${settings.digest.slackChannelName}`
      : null);

  if (!channelRef) {
    console.log(`${tag} skip: no slack channel configured`);
    return false;
  }

  if (!force) {
    if (!isDigestTime(settings.timezone, settings.digest.time)) {
      console.log(
        `${tag} skip: not digest time (configured=${settings.digest.time} ${settings.timezone})`,
      );
      return false;
    }

    if (
      hasAlreadySentToday(settings.digest.lastDigestSentAt, settings.timezone)
    ) {
      console.log(
        `${tag} skip: already sent today (lastDigestSentAt=${settings.digest.lastDigestSentAt})`,
      );
      return false;
    }
  }

  const teamId = await getTeamIdForOrg(org.id);
  if (!teamId) {
    console.log(`${tag} skip: no enabled Slack integration / teamId`);
    return false;
  }

  console.log(
    `${tag} processing (force=${force}, channel=${channelRef}, team=${teamId})`,
  );

  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [metrics, signals] = await Promise.all([
    computeMetrics(org.id, twentyFourHoursAgo),
    loadActiveSignals(org.id),
  ]);

  const pendingReplySignals = signals.filter(
    (s) => s.type === SUGGESTION_TYPE_PENDING_REPLY,
  );
  const loopToCloseSignals = signals.filter(
    (s) => s.type === SUGGESTION_TYPE_LOOP_TO_CLOSE,
  );

  console.log(
    `${tag} metrics=${JSON.stringify(metrics)} pendingReply=${pendingReplySignals.length} loopToClose=${loopToCloseSignals.length}`,
  );

  if (
    metrics.newThreads === 0 &&
    metrics.resolved === 0 &&
    metrics.currentlyOpen === 0 &&
    pendingReplySignals.length === 0 &&
    loopToCloseSignals.length === 0
  ) {
    console.log(`${tag} skip: silent day (all metrics and signals zero)`);
    return false;
  }

  const [pendingReplyItems, loopToCloseItems] = await Promise.all([
    enrichPendingReplySignals(pendingReplySignals, now),
    enrichLoopToCloseSignals(loopToCloseSignals, now),
  ]);

  const payload: DigestPayload = {
    orgName: org.name,
    orgSlug: org.slug,
    metrics,
    pendingReply: pendingReplyItems,
    loopToClose: loopToCloseItems,
  };

  const notifyJob = await queue.add("digest-notify", {
    orgId: org.id,
    teamId,
    channelId: channelRef,
    payload,
  });
  console.log(
    `${tag} enqueued digest-notify job ${notifyJob.id} (channel=${channelRef})`,
  );

  const updatedSettings = {
    ...((org.settings as Record<string, unknown>) ?? {}),
    digest: {
      ...settings.digest,
      lastDigestSentAt: new Date(now).toISOString(),
    },
  };
  await fetchClient.mutate.organization.update(org.id, {
    settings: updatedSettings,
  });

  const nowIso = new Date(now).toISOString();
  for (const signal of signals) {
    const metadata = signal.metadataStr
      ? JSON.parse(signal.metadataStr)
      : { digestIncludedAt: [] };
    metadata.digestIncludedAt = [...(metadata.digestIncludedAt ?? []), nowIso];
    await fetchClient.mutate.suggestion.update(signal.id, {
      metadataStr: JSON.stringify(metadata),
      updatedAt: new Date(now),
    });
  }

  console.log(`📬 Digest enqueued for org ${org.name} (${org.id})`);
  return true;
}

async function computeMetrics(
  organizationId: string,
  since: Date,
): Promise<{ newThreads: number; resolved: number; currentlyOpen: number }> {
  const allThreads = (await fetchClient.query.thread
    .where({ organizationId, deletedAt: null })
    .get()) as ThreadRow[];

  const newThreads = allThreads.filter(
    (t) => new Date(t.createdAt).getTime() >= since.getTime(),
  ).length;

  const currentlyOpen = allThreads.filter((t) =>
    OPEN_STATUSES.includes(t.status),
  ).length;

  const updates = (await fetchClient.query.update
    .where({
      type: "status_changed",
      thread: { organizationId },
    })
    .get()) as UpdateRow[];

  const resolvedThreadIds = new Set<string>();
  for (const update of updates) {
    if (new Date(update.createdAt).getTime() < since.getTime()) continue;
    try {
      const meta = update.metadataStr ? JSON.parse(update.metadataStr) : null;
      const newStatus = meta?.newStatus;
      if (
        typeof newStatus === "number" &&
        RESOLVED_STATUSES.includes(newStatus)
      ) {
        resolvedThreadIds.add(update.threadId);
      }
    } catch {
      // skip malformed metadata
    }
  }

  return { newThreads, resolved: resolvedThreadIds.size, currentlyOpen };
}

async function loadActiveSignals(
  organizationId: string,
): Promise<SuggestionRow[]> {
  return (await fetchClient.query.suggestion
    .where({
      organizationId,
      type: {
        $in: [SUGGESTION_TYPE_PENDING_REPLY, SUGGESTION_TYPE_LOOP_TO_CLOSE],
      },
      active: true,
    })
    .get()) as SuggestionRow[];
}

async function enrichPendingReplySignals(
  signals: SuggestionRow[],
  now: number,
): Promise<DigestPendingReplyItem[]> {
  if (signals.length === 0) return [];

  const threadIds = signals.map((s) => s.entityId);
  const threads = (await fetchClient.query.thread
    .where({ id: { $in: threadIds } })
    .get()) as ThreadRow[];

  const threadMap = new Map(threads.map((t) => [t.id, t]));

  const authorIds = new Set(threads.map((t) => t.authorId));
  const authors = (await fetchClient.query.author
    .where({ id: { $in: [...authorIds] } })
    .get()) as AuthorRow[];
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  return signals
    .map((signal): DigestPendingReplyItem | null => {
      const thread = threadMap.get(signal.entityId);
      if (!thread) return null;

      const author = authorMap.get(thread.authorId);
      const results = signal.resultsStr ? JSON.parse(signal.resultsStr) : null;
      const lastMessageAt = results?.lastMessageAt
        ? new Date(results.lastMessageAt).getTime()
        : new Date(signal.createdAt).getTime();

      return {
        threadId: thread.id,
        threadName: thread.name,
        customerName: author?.name ?? "Unknown",
        waitTimeMs: now - lastMessageAt,
      };
    })
    .filter((item): item is DigestPendingReplyItem => item !== null)
    .sort((a, b) => b.waitTimeMs - a.waitTimeMs);
}

async function enrichLoopToCloseSignals(
  signals: SuggestionRow[],
  now: number,
): Promise<DigestLoopToCloseItem[]> {
  if (signals.length === 0) return [];

  const threadIds = signals.map((s) => s.entityId);
  const threads = (await fetchClient.query.thread
    .where({ id: { $in: threadIds } })
    .get()) as ThreadRow[];

  const threadMap = new Map(threads.map((t) => [t.id, t]));

  return signals
    .map((signal): DigestLoopToCloseItem | null => {
      const thread = threadMap.get(signal.entityId);
      if (!thread) return null;

      const results = signal.resultsStr ? JSON.parse(signal.resultsStr) : null;
      const prMergedAt = results?.prMergedAt
        ? new Date(results.prMergedAt).getTime()
        : new Date(signal.createdAt).getTime();

      const linkedPrId = results?.linkedPrId ?? thread.externalPrId ?? "";
      const prNumber = linkedPrId.match(/#(\d+)/)?.[1];

      return {
        threadId: thread.id,
        threadName: thread.name,
        linkedPrId,
        prDisplayName: prNumber ? `PR #${prNumber}` : "PR",
        timeSinceMergeMs: now - prMergedAt,
      };
    })
    .filter((item): item is DigestLoopToCloseItem => item !== null)
    .sort((a, b) => b.timeSinceMergeMs - a.timeSinceMergeMs);
}

async function getTeamIdForOrg(orgId: string): Promise<string | null> {
  const integrations = (await fetchClient.query.integration
    .where({
      organizationId: orgId,
      type: "slack",
      enabled: true,
    })
    .get()) as IntegrationRow[];

  const integration = integrations[0];
  if (!integration?.configStr) return null;

  try {
    const config = JSON.parse(integration.configStr);
    return config.teamId ?? null;
  } catch {
    return null;
  }
}

function isDigestTime(timezone: string, digestTime: string): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const currentTime = formatter.format(now);

  const [currentH, currentM] = currentTime.split(":").map(Number);
  const [digestH, digestM] = digestTime.split(":").map(Number);

  const currentMinutes = currentH * 60 + currentM;
  const digestMinutes = digestH * 60 + digestM;

  const diff = Math.abs(currentMinutes - digestMinutes);
  const wrappedDiff = Math.min(diff, 1440 - diff);

  return wrappedDiff <= 1;
}

function hasAlreadySentToday(
  lastSentAt: string | null,
  timezone: string,
): boolean {
  if (!lastSentAt) return false;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const todayStr = formatter.format(new Date());
  const lastSentStr = formatter.format(new Date(lastSentAt));

  return todayStr === lastSentStr;
}
