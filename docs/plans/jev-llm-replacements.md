# Jev replacements for LLM judgments

`evaluateWithJev` already lives in `apps/api/src/lib/ai/jev.ts` and is re-exported to the worker. Production still calls DeepSeek (`deepseek-v4-flash`) for every judgment below.

Jev fits calls that pick, score, or accept. Calls that write text stay on a generation model.

Ranked by payoff: how much a swap helps, against how much code and eval work it takes.

## 1. Label classification

`classifyLabel` in `apps/worker/src/pipeline/processors/inline-track/label/classify.ts` already asks for one label id or null, plus a confidence number. That number is self-reported, then gated at 0.5 (suggest) and 0.85 (auto-apply).

A Jev `choice` over the org's labels, with an explicit "none" option, returns a real probability. Keep the existing thresholds on that probability. The label eval set is already there. This is the smallest swap, and it runs on every new thread.

## 2. PR-to-thread rerank

`rerankPrMatches` in `apps/worker/src/lib/pr-match-reranker.ts` is a second-stage judge: up to 20 retrieved threads, accept only at 0.85, 30 second timeout. The prose `reason` is written to logs only. Fan-out uses `accepted` and the score.

One Jev call with a `score` or `noul` question per candidate replaces that judge. A false accept starts a synthesis run, so the reliability win is larger than the call count. The work is rewriting the "same problem, not the same product area" rule as criteria, then keeping the existing threshold in application code.

## 3. Resolution type inside the summary

`summarizeThread` still has to write the title, short description, keywords, and entities. The flaky part of that prompt is the closed decision in `expectedAction`: bug fix, engineering investigation, configuration guidance, documentation, troubleshooting, or clarification.

Pull that into a Jev `choice` and stop asking the summarizer to classify. The summary call remains. Embeddings, the label classifier, and PR rerank already treat that field as a category.

## 4. A gate in front of synthesis

The synthesis agent in `synthesize.ts` is the expensive call: tools plus a customer draft. A Jev pass on the summary can decide whether a run is worth starting at all (off-topic, thank-you, spam, or no unresolved customer need) and which action kinds are eligible (`reply`, `create_issue`, `mark_duplicate`, `set_status`).

Skipping a run is the biggest latency and cost win. It is also the riskiest, because a wrong "no" drops a reply. Do this after 1–3, and only skip when confidence is high.

## 5. Duplicate confirmation

Duplicate detection today is a vector threshold (0.85) in `apps/worker/src/pipeline/processors/synthesis-track/duplicate/processor.ts`. The "same unresolved problem?" judgment then happens inside the synthesis agent as `mark_duplicate`.

A Jev `noul` on the top hit can accept or reject that candidate before the agent sees it. Worth it once the reranker pattern from item 2 exists. It does not remove synthesis when a reply is still required.

## 6. Agent-chat eval judges

`draftQualityScorer` and `draftFactualityScorer` in `apps/api/src/evals/agent-chat.scorers.ts` use Gemini Flash as a rubric judge. Those rubrics (tone, addresses the issue, grounded, no invented policy) map onto `noul` and `score` questions.

No user-facing change. Useful as a proving ground while the label swap is in eval.

## Leave on the generation model

Summary prose, synthesis drafts and tool use, and agent chat stay on a generation model. Embeddings are a different model entirely.
