import { describe, expect, it } from "vitest";

import { resolveSlackTargetPrerequisites } from "./outbound-target";

const validIntegration = {
  configStr: JSON.stringify({ teamId: "T123" }),
  id: "integration-1",
};
const validThread = {
  externalId: "1712345678.000100",
  externalMetadataStr: JSON.stringify({ channelId: "C123" }),
};
const parseIntegrationConfig = (raw: string) => {
  try {
    return JSON.parse(raw) as { teamId?: string };
  } catch {
    return undefined;
  }
};

describe("Slack target prerequisites", () => {
  it.each([
    {
      expected: "integration_not_found",
      integration: null,
      thread: validThread,
    },
    {
      expected: "integration_config_missing",
      integration: { configStr: null, id: "integration-1" },
      thread: validThread,
    },
    {
      expected: "integration_config_invalid",
      integration: { configStr: "not-json", id: "integration-1" },
      thread: validThread,
    },
    {
      expected: "team_id_missing",
      integration: { configStr: "{}", id: "integration-1" },
      thread: validThread,
    },
    {
      expected: "thread_ts_missing",
      integration: validIntegration,
      thread: { ...validThread, externalId: null },
    },
    {
      expected: "thread_metadata_missing",
      integration: validIntegration,
      thread: { ...validThread, externalMetadataStr: null },
    },
    {
      expected: "thread_metadata_invalid",
      integration: validIntegration,
      thread: { ...validThread, externalMetadataStr: "not-json" },
    },
    {
      expected: "channel_id_missing",
      integration: validIntegration,
      thread: { ...validThread, externalMetadataStr: "{}" },
    },
  ])("returns $expected", ({ expected, integration, thread }) => {
    const result = resolveSlackTargetPrerequisites({
      integration,
      parseIntegrationConfig,
      thread,
    });

    expect(result).toMatchObject({ ok: false, reason: expected });
  });

  it("returns the safe Slack target identifiers", () => {
    const result = resolveSlackTargetPrerequisites({
      integration: validIntegration,
      parseIntegrationConfig,
      thread: validThread,
    });

    expect(result).toStrictEqual({
      ok: true,
      target: {
        channelId: "C123",
        integrationId: "integration-1",
        teamId: "T123",
        threadTs: "1712345678.000100",
      },
    });
  });
});
