import type { ActionKind, AutonomyLevel } from "@workspace/schemas/signals";
import { describe, expect, it } from "vitest";

import { normalizeSynthesisRawActionSet } from "./normalize";
import {
  buildSynthesisPrompt,
  enabledSynthesisActionKinds,
  parseRawActionSetFromText,
  SYNTHESIS_ACTION_KINDS,
} from "./synthesize";
import type { SynthesizeThreadReadInput } from "./synthesize";

const allSuggest = (): Record<ActionKind, AutonomyLevel> => ({
  apply_label: "suggest",
  create_issue: "suggest",
  link_issue: "suggest",
  link_pr: "suggest",
  mark_duplicate: "suggest",
  reply: "suggest",
  set_status: "suggest",
});

const inputFor = (
  autonomy: Record<ActionKind, AutonomyLevel> = allSuggest()
): SynthesizeThreadReadInput => ({
  autonomy,
  availability: { create_issue: true },
  hasTeamReply: true,
  hints: {},
  sourceInputMessageId: "message-1",
  summary: null,
  threadId: "thread-1",
  threadMessages: [
    {
      authorId: "customer-1",
      content: "I need help with this request.",
      createdAt: "2026-08-24T00:00:00.000Z",
      id: "message-1",
      role: "customer",
    },
  ],
  threadName: "A support request",
});

const rawActionSet = (action: object) =>
  JSON.stringify({
    alternatives: [],
    primary: [action],
    reasoning: "The customer needs help.",
    recommendation: "Take the next step.",
    sourceInputMessageId: "message-1",
    summary: "Customer needs help.",
    urgencyScore: 10,
  });

describe("synthesis action contract", () => {
  it.each(SYNTHESIS_ACTION_KINDS)(
    "omits an off %s action from the prompt",
    (kind) => {
      const autonomy = allSuggest();
      autonomy[kind] = "off";

      const prompt = buildSynthesisPrompt(inputFor(autonomy));

      expect(prompt).not.toContain(kind);
      expect(enabledSynthesisActionKinds(inputFor(autonomy))).not.toContain(
        kind
      );
    }
  );

  it("also removes create_issue when it is unavailable", () => {
    const input = inputFor();
    input.availability.create_issue = false;

    expect(buildSynthesisPrompt(input)).not.toContain("create_issue");
    expect(enabledSynthesisActionKinds(input)).not.toContain("create_issue");
  });

  it("rejects an off action even if the model emits it", () => {
    const input = inputFor();
    input.autonomy.link_pr = "off";

    expect(() =>
      parseRawActionSetFromText(
        rawActionSet({
          kind: "link_pr",
          prUrl: "https://github.com/acme/repo/pull/1",
        }),
        input
      )
    ).toThrow("Synthesis output parsing failed");
  });

  it("recognizes when every synthesis action is off", () => {
    const autonomy = allSuggest();
    for (const kind of SYNTHESIS_ACTION_KINDS) autonomy[kind] = "off";

    expect(enabledSynthesisActionKinds(inputFor(autonomy)).size).toBe(0);
  });

  it("instructs replies to advance the conversation without recapping the customer problem", () => {
    const prompt = buildSynthesisPrompt(inputFor());

    expect(prompt).toContain("Every reply must move the conversation forward");
    expect(prompt).toContain(
      "Do not repeat or paraphrase their problem, symptoms, error message, request, or troubleshooting steps"
    );
    expect(prompt).toContain(
      "contributing something new: the answer, the current status, the next step, or a focused request"
    );
  });

  it("forbids greetings when the team has already replied", () => {
    const prompt = buildSynthesisPrompt(inputFor());

    expect(prompt).toContain("This is an ongoing conversation");
    expect(prompt).toContain("NEVER begin with a greeting or salutation");
    expect(prompt).not.toContain("First-reply tone:");
    expect(prompt).not.toContain(
      "Customer display name (derive the first name only for this first-reply greeting):"
    );
  });

  it("requires a greeting when the team has not replied", () => {
    const input = inputFor();
    input.customerName = "Alex Rivera";
    input.hasTeamReply = false;

    const prompt = buildSynthesisPrompt(input);

    expect(prompt).toContain("First-reply tone:");
    expect(prompt).toContain("Begin with `Hi <first name>,`");
    expect(prompt).toContain('"John Nolan" becomes "Hi John,"');
    expect(prompt).toContain(
      'derive the first name only for this first-reply greeting): "Alex Rivera"'
    );
    expect(prompt).not.toContain("NEVER begin with a greeting or salutation");
  });

  it("scopes future-update promises to available engineering actions", () => {
    const engineeringPromptInput = inputFor();
    engineeringPromptInput.hasTeamReply = false;
    const engineeringPrompt = buildSynthesisPrompt(engineeringPromptInput);

    expect(engineeringPrompt).toContain("When primary includes link_pr");
    expect(engineeringPrompt).toContain("When primary includes create_issue");

    const autonomy = allSuggest();
    autonomy.create_issue = "off";
    autonomy.link_pr = "off";
    const input = inputFor(autonomy);
    input.hasTeamReply = false;

    const prompt = buildSynthesisPrompt(input);

    expect(prompt).not.toContain("promise to update the customer");
    expect(prompt).not.toContain("promise to follow up with the customer");
  });

  it("keeps enabled non-reply actions on an unreplied thread when reply is off", () => {
    const output = parseRawActionSetFromText(
      rawActionSet({ kind: "set_status", status: 1, witness: null }),
      inputFor()
    );

    expect(
      normalizeSynthesisRawActionSet({
        fallbackSourceInputMessageId: "message-1",
        hasTeamReply: false,
        messageIds: new Set(["message-1"]),
        output,
        replyEnabled: false,
      })?.primary
    ).toStrictEqual([{ kind: "set_status", status: 1 }]);
  });
});
