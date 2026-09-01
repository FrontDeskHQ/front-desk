import type { Action } from "@workspace/schemas/signals";
import { describe, expect, it } from "vitest";

import {
  collectExternalReferenceTokens,
  collectVerifiedEntityOutcomes,
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
});
