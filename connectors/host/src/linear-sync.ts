import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { z } from "zod";

import { getLinearCredential, linearGraphql } from "./linear-client";
import type { LinearClientEnvironment } from "./linear-client";

export const linearIssueSchema = z.object({
  archivedAt: z.string().datetime().nullable().optional(),
  assignee: z.object({ name: z.string() }).nullable().optional(),
  canceledAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  creator: z.object({ name: z.string() }).nullable().optional(),
  description: z.string().nullable().optional(),
  id: z.string(),
  identifier: z.string(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
  number: z.number().int(),
  state: z.object({ name: z.string(), type: z.string() }),
  team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  title: z.string(),
  updatedAt: z.string().datetime(),
  url: z.string().url(),
});

export type LinearIssue = z.infer<typeof linearIssueSchema>;

const issuesPageSchema = z.object({
  issues: z.object({
    nodes: z.array(linearIssueSchema),
    pageInfo: z.object({
      endCursor: z.string().nullable(),
      hasNextPage: z.boolean(),
    }),
  }),
});

const ISSUES_QUERY = `query FrontDeskIssues($after: String) {
  issues(first: 50, after: $after, includeArchived: false) {
    nodes {
      id identifier number url title description createdAt updatedAt archivedAt
      completedAt canceledAt
      creator { name }
      assignee { name }
      state { name type }
      team { id key name }
      labels { nodes { name } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ISSUE_QUERY = `query FrontDeskIssue($id: String!) {
  issue(id: $id) {
    id identifier number url title description createdAt updatedAt archivedAt
    completedAt canceledAt
    creator { name }
    assignee { name }
    state { name type }
    team { id key name }
    labels { nodes { name } }
  }
}`;

const issueResponseSchema = z.object({ issue: linearIssueSchema.nullable() });

export const linearExternalKey = (id: string) => `linear:${id}`;

const linearState = (type: string): "closed" | "open" =>
  type === "completed" || type === "canceled" ? "closed" : "open";

export const buildLinearIssueFields = (issue: LinearIssue) => ({
  assignees: issue.assignee ? [issue.assignee.name] : [],
  authorLogin: issue.creator?.name ?? null,
  baseRef: null,
  body: issue.description ?? null,
  closedAt:
    issue.completedAt || issue.canceledAt
      ? new Date(issue.completedAt ?? issue.canceledAt ?? "")
      : null,
  containerId: issue.team.id,
  containerKind: "team",
  containerLabel: issue.team.key,
  draft: null,
  externalCreatedAt: new Date(issue.createdAt),
  externalKey: linearExternalKey(issue.id),
  externalRef: {
    id: issue.id,
    identifier: issue.identifier,
    teamId: issue.team.id,
  },
  externalUpdatedAt: new Date(issue.updatedAt),
  headRef: null,
  labels: issue.labels.nodes.map((label) => label.name),
  merged: null,
  mergedAt: null,
  number: issue.number,
  provider: "linear",
  repoFullName: issue.team.key,
  shortId: issue.identifier,
  state: linearState(issue.state.type),
  title: issue.title,
  type: "issue" as const,
  url: issue.url,
});

export interface LinearSyncDependencies {
  environment: LinearClientEnvironment;
  fetchClient: LiveStateFetchClient;
  fetcher?: typeof fetch;
}

export const createLinearSync = (dependencies: LinearSyncDependencies) => {
  const fetcher = dependencies.fetcher ?? fetch;

  const upsertIssue = async (organizationId: string, issue: LinearIssue) => {
    await dependencies.fetchClient.mutate.externalEntity.upsert({
      organizationId,
      ...buildLinearIssueFields(issue),
    });
  };

  const syncIntegration = async (integrationId: string) => {
    const { credential, organizationId } = await getLinearCredential(
      integrationId,
      dependencies.environment,
      fetcher
    );
    const existing =
      await dependencies.fetchClient.query.externalEntity.listForIntegration({
        integrationId,
        organizationId,
      });
    const seen = new Set<string>();
    let after: string | null = null;
    do {
      const raw: unknown = await linearGraphql<unknown>(
        credential.accessToken,
        ISSUES_QUERY,
        { after },
        fetcher
      );
      const page: z.infer<typeof issuesPageSchema>["issues"] =
        issuesPageSchema.parse(raw).issues;
      for (const issue of page.nodes) {
        seen.add(linearExternalKey(issue.id));
      }
      await Promise.all(
        page.nodes.map((issue) => upsertIssue(organizationId, issue))
      );
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);

    await Promise.all(
      existing
        .filter((entity) => !entity.deletedAt && !seen.has(entity.externalKey))
        .map((entity) =>
          dependencies.fetchClient.mutate.externalEntity.softDelete({
            externalKey: entity.externalKey,
            organizationId,
          })
        )
    );
    return { mirrored: seen.size };
  };

  const syncIssue = async (integrationId: string, issueId: string) => {
    const { credential, organizationId } = await getLinearCredential(
      integrationId,
      dependencies.environment,
      fetcher
    );
    const raw: unknown = await linearGraphql<unknown>(
      credential.accessToken,
      ISSUE_QUERY,
      { id: issueId },
      fetcher
    );
    const issue = issueResponseSchema.parse(raw).issue;
    if (!issue || issue.archivedAt) {
      await dependencies.fetchClient.mutate.externalEntity.softDelete({
        externalKey: linearExternalKey(issueId),
        organizationId,
      });
      return;
    }
    await upsertIssue(organizationId, issue);
  };

  const syncAll = async () => {
    const integrations =
      await dependencies.fetchClient.query.integration.listByType({
        type: "linear",
      });
    const enabledIntegrations = integrations.filter(
      (integration) => integration.enabled
    );
    const results = await Promise.allSettled(
      enabledIntegrations.map((integration) => syncIntegration(integration.id))
    );
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error(
          `[Linear] Reconciliation failed for ${enabledIntegrations[index]?.id}:`,
          result.reason
        );
      }
    }
  };

  return { syncAll, syncIntegration, syncIssue, upsertIssue };
};
