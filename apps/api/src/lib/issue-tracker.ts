import { invokeCapability } from "@connectors/framework";
import type { NormalizedIssue } from "@connectors/framework";
import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import { readCapabilityPrimary } from "@workspace/schemas/organization";

import { schema } from "../live-state/schema";
import { connectorInvokeSecret, connectorRegistry } from "./connector-registry";
import { runRecordActivity } from "./update-mutations";

type OrganizationRow = InferLiveObject<typeof schema.organization>;

type IssueTrackerDb = Pick<
  ServerDB<typeof schema>,
  "find" | "insert" | "thread"
>;

export interface ResolvedIssueTracker {
  integration: { id: string; type: string; configStr: string };
  invokeUrl: string;
  organization: OrganizationRow;
}

/**
 * Resolve the enabled, configured integration that should receive an
 * issue-tracker `create`. Unlike `resolveEntityCapabilityTarget` there is no
 * mirrored entity to route by — nothing has been created yet — so selection
 * falls back through: an explicitly pinned `integrationId`, then the org's
 * primary for the capability, then the first enabled provider.
 *
 * Returns null when the org has no usable issue tracker, which is also what
 * makes `create_issue` unavailable to the Agent.
 */
export const resolveIssueTrackerTarget = async (
  db: IssueTrackerDb,
  organizationId: string,
  integrationId?: string
): Promise<ResolvedIssueTracker | null> => {
  const enabledIntegrations = Object.values(
    await db.find(schema.integration, {
      include: { organization: true },
      where: { enabled: true, organizationId },
    })
  ) as (InferLiveObject<typeof schema.integration> & {
    organization?: OrganizationRow;
  })[];

  const providerTypes = new Set(
    connectorRegistry
      .providersOf("issue-tracker")
      .map((entry) => entry.manifest.type)
  );

  const primaryIssueTrackerId = readCapabilityPrimary(
    enabledIntegrations[0]?.organization?.settings,
    "issue-tracker"
  );

  const integration = integrationId
    ? enabledIntegrations.find(
        (i) => i.id === integrationId && providerTypes.has(i.type)
      )
    : ((primaryIssueTrackerId
        ? enabledIntegrations.find(
            (i) => i.id === primaryIssueTrackerId && providerTypes.has(i.type)
          )
        : undefined) ??
      enabledIntegrations.find((i) => providerTypes.has(i.type)));

  // An integration can be enabled before it's configured (`configStr` is
  // nullable); treat that as unresolved rather than forwarding a null config.
  if (!integration?.configStr) {
    return null;
  }

  const entry = connectorRegistry.getByType(integration.type);
  if (!entry) {
    return null;
  }

  const organization = integration.organization;
  if (!organization) {
    return null;
  }

  return {
    integration: {
      configStr: integration.configStr,
      id: integration.id,
      type: integration.type,
    },
    invokeUrl: entry.invokeUrl,
    organization,
  };
};

/**
 * Body footer appended to every issue FrontDesk files. This authed thread link
 * is the *only* path from the issue back to the customer — issue bodies
 * deliberately carry no reporter identity, since an issue may land in a public
 * repo.
 */
const threadFooter = (orgSlug: string, threadId: string): string =>
  `\n\n---\n\nIssue created using FrontDesk. [Click to view thread](https://${orgSlug}.tryfrontdesk.app/threads/${threadId}).`;

/**
 * Dispatch an issue-tracker `create` and record the `issue_created` activity.
 * Shared by the human path (`thread.createIssue`) and the Agent's `create_issue`
 * handler so the footer, dispatch, and activity trail can't drift apart. It does
 * **not** write `thread.externalIssueId` — the human path links from the client,
 * while the Agent's handler links server-side in the same step.
 */
export const runCreateIssue = async (
  db: IssueTrackerDb,
  args: {
    organizationId: string;
    threadId: string;
    title: string;
    body?: string;
    /** Opaque, connector-interpreted sub-resource selector; forwarded untouched. */
    target: Record<string, unknown>;
    integrationId?: string;
    actorUserId: string | null;
    actorUserName: string | null;
  }
): Promise<NormalizedIssue> => {
  const target = await resolveIssueTrackerTarget(
    db,
    args.organizationId,
    args.integrationId
  );
  if (!target) {
    throw new Error("ISSUE_TRACKER_NOT_CONFIGURED");
  }

  const orgSlug = target.organization.slug;
  if (!orgSlug) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }

  const { entity } = await invokeCapability<{ entity: NormalizedIssue }>(
    target.invokeUrl,
    {
      capability: "issue-tracker",
      config: target.integration.configStr,
      method: "create",
      payload: {
        body: (args.body ?? "") + threadFooter(orgSlug, args.threadId),
        target: args.target,
        title: args.title,
      },
    },
    { secret: connectorInvokeSecret }
  );

  await runRecordActivity(db, {
    metadata: {
      issueId: entity.id,
      issueLabel: entity.label,
      issueShortId: entity.shortId,
    },
    organizationId: args.organizationId,
    replicatedStr: null,
    threadId: args.threadId,
    type: "issue_created",
    userId: args.actorUserId,
    userName: args.actorUserName,
  });

  return entity;
};
