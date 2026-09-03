import type { Action } from "@workspace/schemas/signals";
import { describe, expect, it } from "vitest";

import {
  filterRedundantLinkActions,
  recommendationAfterRedundantLink,
} from "./existing-link-verification";

const issueUrl = "https://github.com/acme/app/issues/42";
const issueKey = "github:acme/app#42";
const reply: Action = {
  draftMarkdown: "The fix is live.",
  grounding: { class: "state_report", entityUrl: issueUrl, sources: [] },
  kind: "reply",
};
const resolve: Action = {
  kind: "set_status",
  status: 2,
  witness: {
    class: "entity_settled",
    outcome: "delivered",
    sources: [issueUrl],
  },
};

describe(filterRedundantLinkActions, () => {
  it("removes a link to the issue already attached to the thread", () => {
    const result = filterRedundantLinkActions(
      [{ issueUrl, kind: "link_issue" }, resolve, reply],
      [],
      { issueExternalKey: issueKey },
      new Map([[issueUrl, { externalKey: issueKey }]]),
      new Map()
    );

    expect(result.primary).toStrictEqual([resolve, reply]);
    expect(result.removedPrimary).toBeTruthy();
    expect(recommendationAfterRedundantLink(result.primary as Action[])).toBe(
      "Reply with the verified update and resolve the thread."
    );
  });

  it("keeps an intentional relink to a different issue", () => {
    const result = filterRedundantLinkActions(
      [{ issueUrl, kind: "link_issue" }],
      [],
      { issueExternalKey: "github:acme/app#41" },
      new Map([[issueUrl, { externalKey: issueKey }]]),
      new Map()
    );

    expect(result.primary).toStrictEqual([{ issueUrl, kind: "link_issue" }]);
    expect(result.removedPrimary).toBeFalsy();
  });

  it("removes a link to the pull request already attached to the thread", () => {
    const prUrl = "https://github.com/acme/app/pull/43";
    const prKey = "github:acme/app#43";
    const result = filterRedundantLinkActions(
      [{ kind: "link_pr", prUrl }],
      [],
      { pullRequestExternalKey: prKey },
      new Map(),
      new Map([[prUrl, { externalKey: prKey }]])
    );

    expect(result.primary).toStrictEqual([]);
    expect(result.removedPrimary).toBeTruthy();
  });
});
