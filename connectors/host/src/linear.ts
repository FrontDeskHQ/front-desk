import {
  issueTrackerCreatePayloadSchema,
  normalizedIssueSchema,
} from "@connectors/framework";
import { linearIntegrationSchema } from "@workspace/schemas/integration/linear";
import { z } from "zod";

import type { HostedConnector } from "./host";
import { getLinearCredential, linearGraphql } from "./linear-client";
import type { LinearClientEnvironment } from "./linear-client";
import { linearExternalKey } from "./linear-sync";

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

const LINEAR_CREATE_TIMEOUT_MS = 8_000;

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
    if (method !== "create") {
      return { body: { error: "METHOD_NOT_IMPLEMENTED" }, status: 501 };
    }
    if (!(integrationId && dependencies.environment)) {
      return { body: { error: "LINEAR_NOT_CONFIGURED" }, status: 503 };
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
      const timeoutSignal = AbortSignal.timeout(LINEAR_CREATE_TIMEOUT_MS);
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
  async probe() {
    return { live: false };
  },
  type: "linear",
});

export const linearConnector = createLinearConnector();
