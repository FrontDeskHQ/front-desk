import { describe, expect, it } from "vitest";

import {
  capabilityEntityRefSchema,
  issueTrackerListTargetsResultSchema,
  issueTrackerLookupPayloadSchema,
  normalizedIssueSchema,
} from "./capabilities";

describe("issue-tracker contracts", () => {
  it("accepts provider-neutral issue identity", () => {
    expect(
      normalizedIssueSchema.parse({
        body: "Customer-visible export is truncated.",
        container: {
          externalId: "team-uuid",
          kind: "team",
          label: "Engineering",
        },
        externalRef: { issueId: "issue-uuid", teamId: "team-uuid" },
        id: "linear:issue-uuid",
        label: "ENG-456",
        shortId: "ENG-456",
        state: "Started",
        title: "Export truncates long records",
        url: "https://linear.app/example/issue/ENG-456",
      })
    ).toMatchObject({
      container: { kind: "team", label: "Engineering" },
      externalRef: { issueId: "issue-uuid", teamId: "team-uuid" },
      shortId: "ENG-456",
    });
  });

  it("keeps provider addressing opaque to core", () => {
    expect(
      capabilityEntityRefSchema.parse({
        container: {
          externalId: "frontdesk/app",
          kind: "repository",
          label: "frontdesk/app",
        },
        externalKey: "github:frontdesk/app#42",
        externalRef: { number: 42, owner: "frontdesk", repo: "app" },
        shortId: "42",
        url: "https://github.com/frontdesk/app/issues/42",
      })
    ).toStrictEqual({
      container: {
        externalId: "frontdesk/app",
        kind: "repository",
        label: "frontdesk/app",
      },
      externalKey: "github:frontdesk/app#42",
      externalRef: { number: 42, owner: "frontdesk", repo: "app" },
      shortId: "42",
      url: "https://github.com/frontdesk/app/issues/42",
    });
  });

  it("keeps issue targets opaque to core", () => {
    expect(
      issueTrackerListTargetsResultSchema.parse({
        targets: [
          {
            label: "Engineering",
            target: { teamId: "team-uuid" },
          },
        ],
      })
    ).toStrictEqual({
      targets: [
        {
          label: "Engineering",
          target: { teamId: "team-uuid" },
        },
      ],
    });
  });

  it("rejects an empty exact lookup reference", () => {
    expect(() =>
      issueTrackerLookupPayloadSchema.parse({ reference: "   " })
    ).toThrow("Too small");
  });
});
