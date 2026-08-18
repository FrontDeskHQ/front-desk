import { describe, expect, it } from "vitest";

import { serializeObservableModelStep } from "./model-audit";

describe("model audit serialization", () => {
  it("keeps observable output while excluding reasoning and provider metadata", () => {
    const serialized = serializeObservableModelStep({
      content: [
        { text: "visible", type: "text" },
        { text: "hidden", type: "reasoning" },
        { data: "hidden", type: "reasoning-file" },
        { input: { query: "docs" }, type: "tool-call" },
      ],
      response: {
        id: "response-1",
        messages: [{ content: "should not be copied" }],
        modelId: "model-1",
        timestamp: new Date().toISOString(),
      },
      providerMetadata: {
        google: { hiddenReasoning: "should not be copied" },
      },
      text: "visible",
    });

    expect(serialized.content).toStrictEqual([
      { text: "visible", type: "text" },
      { input: { query: "docs" }, type: "tool-call" },
    ]);
    expect(serialized.response).toStrictEqual({
      id: "response-1",
      modelId: "model-1",
      timestamp: expect.any(String),
    });
    expect(serialized).not.toHaveProperty("providerMetadata");
  });
});
