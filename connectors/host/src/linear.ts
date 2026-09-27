import {
  issueTrackerCreatePayloadSchema,
  normalizedIssueSchema,
  trackerReadOutcomePayloadSchema,
  trackerReadOutcomeResultSchema,
} from "@connectors/framework";
import { linearIntegrationSchema } from "@workspace/schemas/integration/linear";
import { z } from "zod";

import {
  getLinearCredential,
  linearGraphql,
  readLinearCredential,
} from "./linear-client";
import type { LinearClientEnvironment } from "./linear-client";
import { linearExternalKey } from "./linear-sync";
import type { HostedConnector } from "./provider";

const createResponseSchema = z.object({
  issueCreate: z.object({
    issue: z
      .object({
        description: z.string().nullable().optional(),
        id: z.string(),
        identifier: z.string(),
        state: z.object({ type: z.string() }),
        team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
        title: z.string(),
        url: z.string(),
      })
      .nullable(),
    success: z.boolean(),
  }),
});

const CREATE_MUTATION = `mutation FrontDeskIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id identifier title description url
      state { type }
      team { id key name }
    }
  }
}`;

const LINEAR_OPERATION_TIMEOUT_MS = 8_000;

const VIEWER_QUERY = `query FrontDeskViewerProbe { viewer { id } }`;

const viewerResponseSchema = z.object({
  viewer: z.object({ id: z.string() }),
});

const OUTCOME_QUERY = `query FrontDeskIssueOutcome($id: String!, $after: String) {
  issue(id: $id) {
    id identifier title url
    state { name type }
    team { id key name }
    relations(first: 50, after: $after) {
      nodes { type relatedIssue {
        id identifier title url
        state { name type }
        team { id key name }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const outcomeIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  state: z.object({ name: z.string(), type: z.string() }),
  team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  title: z.string(),
  url: z.string(),
});

const outcomeResponseSchema = z.object({
  issue: outcomeIssueSchema
    .extend({
      relations: z.object({
        nodes: z.array(
          z.object({
            relatedIssue: outcomeIssueSchema,
            type: z.string(),
          })
        ),
        pageInfo: z.object({
          endCursor: z.string().nullable(),
          hasNextPage: z.boolean(),
        }),
      }),
    })
    .nullable(),
});

type OutcomeIssue = z.infer<typeof outcomeIssueSchema>;

const outcomeForState = (stateType: string) => {
  if (stateType === "completed") return "delivered" as const;
  if (stateType === "canceled" || stateType === "duplicate") {
    return "declined" as const;
  }
  return "unknown" as const;
};

const outcomeEntity = (issue: OutcomeIssue) => ({
  entity: {
    container: {
      externalId: issue.team.id,
      kind: "team",
      label: issue.team.key,
    },
    externalKey: linearExternalKey(issue.id),
    externalRef: {
      id: issue.id,
      identifier: issue.identifier,
      teamId: issue.team.id,
    },
    shortId: issue.identifier,
    url: issue.url,
  },
  finished:
    issue.state.type === "completed" ||
    issue.state.type === "canceled" ||
    issue.state.type === "duplicate",
  outcome: outcomeForState(issue.state.type),
  state: issue.state.type,
  title: issue.title,
  type: "issue" as const,
});

export interface LinearConnectorDependencies {
  environment?: LinearClientEnvironment;
  fetcher?: typeof fetch;
}

export const createLinearConnector = (
  dependencies: LinearConnectorDependencies = {}
): HostedConnector => ({
  async invoke({ capability, config, integrationId, method, payload }) {
    if (capability !== "issue-tracker") {
      return { body: { error: "METHOD_NOT_IMPLEMENTED" }, status: 501 };
    }
    if (method === "disconnect") {
      if (!(integrationId && dependencies.environment)) {
        return { body: { error: "LINEAR_NOT_CONFIGURED" }, status: 503 };
      }
      try {
        const timeoutSignal = AbortSignal.timeout(LINEAR_OPERATION_TIMEOUT_MS);
        const context = await readLinearCredential(
          integrationId,
          dependencies.environment,
          dependencies.fetcher,
          { signal: timeoutSignal }
        );
        if (!context) {
          return {
            body: { alreadyRevoked: true, ok: true },
            status: 200,
          };
        }
        const { credential } = context;
        const response = await (dependencies.fetcher ?? fetch)(
          "https://api.linear.app/oauth/revoke",
          {
            body: new URLSearchParams({
              token: credential.accessToken,
              token_type_hint: "access_token",
            }),
            headers: { "content-type": "application/x-www-form-urlencoded" },
            method: "POST",
            signal: timeoutSignal,
          }
        );
        // Linear returns 400 for an already-revoked token and 401 when the
        // token can no longer authenticate. Both satisfy disconnect intent.
        if (![200, 400, 401].includes(response.status)) {
          return { body: { error: "LINEAR_REVOKE_FAILED" }, status: 503 };
        }
        return { body: { ok: true }, status: 200 };
      } catch (error) {
        console.error("[Linear] Disconnect failed:", error);
        return { body: { error: "LINEAR_REVOKE_FAILED" }, status: 503 };
      }
    }

    if (!config) return { body: { error: "MISSING_CONFIG" }, status: 400 };
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(config);
    } catch {
      return { body: { error: "INVALID_CONFIG" }, status: 400 };
    }
    const parsedConfig = linearIntegrationSchema.safeParse(parsedJson);
    if (!parsedConfig.success) {
      return { body: { error: "INVALID_CONFIG" }, status: 400 };
    }

    if (method === "listTargets") {
      return {
        body: {
          targets: parsedConfig.data.teams.map((team) => ({
            label: `${team.key} — ${team.name}`,
            target: { teamId: team.id },
          })),
        },
        status: 200,
      };
    }
    if (method !== "create" && method !== "readOutcome") {
      return { body: { error: "METHOD_NOT_IMPLEMENTED" }, status: 501 };
    }
    if (!(integrationId && dependencies.environment)) {
      return { body: { error: "LINEAR_NOT_CONFIGURED" }, status: 503 };
    }
    if (method === "readOutcome") {
      const parsed = trackerReadOutcomePayloadSchema.safeParse(payload);
      const externalId = parsed.success
        ? z.string().safeParse(parsed.data.entity.externalRef.id)
        : null;
      if (!parsed.success || !externalId?.success) {
        return { body: { error: "INVALID_OUTCOME_REQUEST" }, status: 400 };
      }
      try {
        const timeoutSignal = AbortSignal.timeout(LINEAR_OPERATION_TIMEOUT_MS);
        const { credential } = await getLinearCredential(
          integrationId,
          dependencies.environment,
          dependencies.fetcher,
          { signal: timeoutSignal }
        );
        const raw = await linearGraphql<unknown>(
          credential.accessToken,
          OUTCOME_QUERY,
          { after: null, id: externalId.data },
          dependencies.fetcher,
          { signal: timeoutSignal }
        );
        let issue = outcomeResponseSchema.parse(raw).issue;
        if (!issue) return { body: { error: "ISSUE_NOT_FOUND" }, status: 404 };
        const relationNodes = issue.relations.nodes;
        let pageInfo = issue.relations.pageInfo;
        const mayHaveSuccessor =
          issue.state.type === "canceled" || issue.state.type === "duplicate";
        if (mayHaveSuccessor) {
          while (
            !relationNodes.some((relation) => relation.type === "duplicate") &&
            pageInfo.hasNextPage &&
            pageInfo.endCursor
          ) {
            const next = outcomeResponseSchema.parse(
              await linearGraphql<unknown>(
                credential.accessToken,
                OUTCOME_QUERY,
                { after: pageInfo.endCursor, id: externalId.data },
                dependencies.fetcher,
                { signal: timeoutSignal }
              )
            ).issue;
            if (!next) break;
            relationNodes.push(...next.relations.nodes);
            pageInfo = next.relations.pageInfo;
            issue = next;
          }
        }
        const duplicate = relationNodes.find(
          (relation) => relation.type === "duplicate"
        )?.relatedIssue;
        const result = outcomeEntity(issue);
        const successor =
          (issue.state.type === "canceled" ||
            issue.state.type === "duplicate") &&
          duplicate
            ? outcomeEntity(duplicate)
            : null;
        return {
          body: trackerReadOutcomeResultSchema.parse({
            ...result,
            ...(successor
              ? { outcome: "superseded", successor }
              : { successor: null }),
          }),
          status: 200,
        };
      } catch (error) {
        console.error("[Linear] Outcome read failed:", error);
        if (
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          return {
            body: { error: "LINEAR_OUTCOME_READ_TIMEOUT" },
            status: 504,
          };
        }
        return { body: { error: "LINEAR_OUTCOME_READ_FAILED" }, status: 503 };
      }
    }

    const parsedPayload = issueTrackerCreatePayloadSchema.safeParse(payload);
    const teamId = parsedPayload.success
      ? z.string().safeParse(parsedPayload.data.target.teamId)
      : null;
    if (!parsedPayload.success || !teamId?.success) {
      return { body: { error: "INVALID_CREATE_REQUEST" }, status: 400 };
    }
    if (!parsedConfig.data.teams.some((team) => team.id === teamId.data)) {
      return { body: { error: "REPOSITORY_NOT_CONNECTED" }, status: 400 };
    }

    try {
      const timeoutSignal = AbortSignal.timeout(LINEAR_OPERATION_TIMEOUT_MS);
      const { credential } = await getLinearCredential(
        integrationId,
        dependencies.environment,
        dependencies.fetcher,
        { signal: timeoutSignal }
      );
      const raw = await linearGraphql<unknown>(
        credential.accessToken,
        CREATE_MUTATION,
        {
          input: {
            description: parsedPayload.data.body,
            teamId: teamId.data,
            title: parsedPayload.data.title,
          },
        },
        dependencies.fetcher,
        { signal: timeoutSignal }
      );
      const created = createResponseSchema.parse(raw).issueCreate;
      if (!(created.success && created.issue)) {
        return { body: { error: "LINEAR_CREATE_FAILED" }, status: 502 };
      }
      const issue = created.issue;
      return {
        body: {
          entity: normalizedIssueSchema.parse({
            body: issue.description ?? "",
            container: {
              externalId: issue.team.id,
              kind: "team",
              label: issue.team.key,
            },
            externalRef: {
              id: issue.id,
              identifier: issue.identifier,
              teamId: issue.team.id,
            },
            id: linearExternalKey(issue.id),
            label: issue.identifier,
            shortId: issue.identifier,
            state: issue.state.type,
            title: issue.title,
            url: issue.url,
          }),
        },
        status: 200,
      };
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        return { body: { error: "CREATE_OUTCOME_UNKNOWN" }, status: 504 };
      }
      console.error("[Linear] Issue creation failed:", error);
      return { body: { error: "LINEAR_CREATE_FAILED" }, status: 502 };
    }
  },
  async probe(config, integrationId) {
    let parsedConfig: unknown;
    try {
      parsedConfig = config ? JSON.parse(config) : null;
    } catch {
      return { live: false };
    }
    if (!linearIntegrationSchema.safeParse(parsedConfig).success) {
      return { live: false };
    }
    if (!(integrationId && dependencies.environment)) {
      return { live: false };
    }
    try {
      const { credential } = await getLinearCredential(
        integrationId,
        dependencies.environment,
        dependencies.fetcher
      );
      const raw = await linearGraphql<unknown>(
        credential.accessToken,
        VIEWER_QUERY,
        {},
        dependencies.fetcher
      );
      viewerResponseSchema.parse(raw);
      return { live: true };
    } catch (error) {
      console.error("[Linear] Connection probe failed:", error);
      return { live: false };
    }
  },
  type: "linear",
});

export const linearConnector = createLinearConnector();
