import { describe, expect, it } from "vitest";

import { normalizeSynthesisRawActionSet } from "./normalize";
import type { SynthesisRawActionSet } from "./synthesize";

describe("agent read Markdown normalization", () => {
  it("strips raw HTML from every Markdown field", () => {
    const output: SynthesisRawActionSet = {
      alternatives: [{ draftMarkdown: "<em>Alternative</em>", kind: "reply" }],
      primary: [{ draftMarkdown: "<strong>Primary</strong>", kind: "reply" }],
      reasoning: "<span>Reasoning</span>",
      recommendation: "<span>Recommendation</span>",
      sourceInputMessageId: "message-1",
      summary: "<span>Summary</span>",
      urgencyScore: 50,
    };

    const result = normalizeSynthesisRawActionSet({
      output,
      messageIds: new Set(["message-1"]),
      fallbackSourceInputMessageId: "message-1",
      hasTeamReply: false,
    });

    if (!result) {
      throw new Error("Expected a normalized agent read");
    }

    expect(result.primary).toStrictEqual([
      { draftMarkdown: "<strong>Primary</strong>", kind: "reply" },
    ]);
    expect(result.alternatives).toStrictEqual([
      { draftMarkdown: "<em>Alternative</em>", kind: "reply" },
    ]);
    expect(result.reasoning).toBe("Reasoning");
    expect(result.recommendation).toBe("Recommendation");
    expect(result.summary).toBe("Summary");
  });
});
