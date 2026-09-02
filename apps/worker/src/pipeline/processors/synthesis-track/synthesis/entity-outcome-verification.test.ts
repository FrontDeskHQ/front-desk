import type { Action } from "@workspace/schemas/signals";
import { describe, expect, it } from "vitest";

import {
  addExternalEntityReferenceTokens,
  collectExternalReferenceTokens,
  collectVerifiedEntityOutcomes,
  replyContainsExternalReference,
  verifyEntityOutcomeActions,
} from "./entity-outcome-verification";

const url = "https://github.com/acme/app/issues/1";

describe("entity outcome verification", () => {
  it("collects root and structured successor outcomes", () => {
    const outcomes = collectVerifiedEntityOutcomes([
      {
        toolResults: [
          {
            toolName: "read_external_entity",
            output: {
              status: "ok",
              result: {
                entity: {
                  externalKey: "github:acme/app#1",
                  number: 1,
                  repoFullName: "acme/app",
                  url,
                },
                finished: true,
                outcome: "superseded",
                successor: {
                  entity: {
                    externalKey: "github:acme/app#10",
                    number: 10,
                    repoFullName: "acme/app",
                    url: `${url}0`,
                  },
                  finished: true,
                  outcome: "delivered",
                },
              },
            },
          },
        ],
      },
    ]);
    expect(outcomes.get(url)).toBe("superseded");
    expect(outcomes.get(`${url}0`)).toBe("delivered");
  });

  it("collects exact external references that customer drafts may not expose", () => {
    const tokens = collectExternalReferenceTokens([
      {
        toolResults: [
          {
            toolName: "read_external_entity",
            output: {
              status: "ok",
              result: {
                entity: {
                  externalKey: "github:acme/app#1",
                  number: 1,
                  repoFullName: "acme/app",
                  url,
                },
                finished: true,
                outcome: "delivered",
                successor: null,
              },
            },
          },
        ],
      },
    ]);
    expect(tokens).toEqual(
      new Set([url, "github:acme/app#1", "acme/app#1", "#1"])
    );
  });

  it("accepts outcomes only for the finished trigger and its successor", () => {
    const steps = [
      {
        toolResults: [
          {
            toolName: "read_external_entity",
            output: {
              status: "ok",
              result: {
                entity: {
                  externalKey: "github:other/app#2",
                  number: 2,
                  repoFullName: "other/app",
                  url: "https://github.com/other/app/issues/2",
                },
                finished: true,
                outcome: "delivered",
                successor: null,
              },
            },
          },
        ],
      },
    ];

    expect(collectVerifiedEntityOutcomes(steps, new Set([url]))).toEqual(
      new Map()
    );
  });

  it("derives repository and number tokens from a finished trigger", () => {
    const tokens = new Set<string>();
    addExternalEntityReferenceTokens(tokens, {
      externalKey: "github:acme/app#42",
      url: "https://github.com/acme/app/issues/42",
    });

    expect(tokens).toEqual(
      new Set([
        "github:acme/app#42",
        "https://github.com/acme/app/issues/42",
        "acme/app#42",
        "#42",
      ])
    );
  });

  it("blocks issue and PR number phrases in customer drafts", () => {
    expect(
      replyContainsExternalReference(
        {
          draftMarkdown: "The fix from issue 42 is available now.",
          kind: "reply",
        },
        new Set()
      )
    ).toBe(true);
    expect(
      replyContainsExternalReference(
        { draftMarkdown: "PR #42 has merged.", kind: "reply" },
        new Set()
      )
    ).toBe(true);
  });

  it("downgrades an unverified delivered witness and triggered reply", () => {
    const actions: Action[] = [
      {
        kind: "reply",
        draftMarkdown: "This is fixed.",
        grounding: { class: "state_report", entityUrl: url, sources: [] },
      },
      {
        kind: "set_status",
        status: 2,
        witness: {
          class: "entity_settled",
          outcome: "delivered",
          sources: [url],
        },
      },
    ];
    const verified = verifyEntityOutcomeActions(
      actions,
      new Map(),
      new Set([url])
    );
    expect(verified[0]).toMatchObject({ grounding: { class: "inferred" } });
    expect(verified[1]).toMatchObject({ witness: { class: "inferred" } });
  });

  it("preserves actions that exactly match a delivered provider read", () => {
    const action: Action = {
      kind: "set_status",
      status: 2,
      witness: {
        class: "entity_settled",
        outcome: "delivered",
        sources: [url],
      },
    };
    expect(
      verifyEntityOutcomeActions(
        [action],
        new Map([[url, "delivered"]]),
        new Set([url])
      )
    ).toEqual([action]);
  });

  it("downgrades a witness when any cited source conflicts", () => {
    const action: Action = {
      kind: "set_status",
      status: 2,
      witness: {
        class: "entity_settled",
        outcome: "delivered",
        sources: [url, `${url}0`],
      },
    };

    expect(
      verifyEntityOutcomeActions(
        [action],
        new Map([
          [url, "delivered"],
          [`${url}0`, "declined"],
        ]),
        new Set([url])
      )[0]
    ).toMatchObject({ witness: { class: "inferred" } });
  });

  it("downgrades a triggered state report for an unrelated entity", () => {
    const action: Action = {
      draftMarkdown: "This is fixed.",
      grounding: {
        class: "state_report",
        entityUrl: "https://github.com/other/app/issues/2",
        sources: [],
      },
      kind: "reply",
    };

    expect(
      verifyEntityOutcomeActions(
        [action],
        new Map([[url, "delivered"]]),
        new Set([url])
      )[0]
    ).toMatchObject({ grounding: { class: "inferred" } });
  });
});
