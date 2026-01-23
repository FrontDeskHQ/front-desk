import { google } from "@ai-sdk/google";
import type { InferLiveObject } from "@live-state/sync";
import { generateText, Output } from "ai";
import type { schema } from "api/schema";
import z from "zod";

export const summarySchema = z.object({
  title: z
    .string()
    .describe(
      "A normalized, canonical problem statement. Should match semantically similar issues regardless of original wording. No ticket-style prefixes.",
    ),
  shortDescription: z
    .string()
    .describe(
      "The distilled core problem with only essential context. 2-3 sentences. Avoid circumstantial details.",
    ),
  keywords: z
    .array(z.string())
    .max(7)
    .describe(
      "Canonical terms that identify the problem category. Use normalized vocabulary. Max 5-7 terms that would match similar issues.",
    ),
  entities: z
    .array(z.string())
    .describe(
      "Technical components, features, systems, or products directly involved. Not actions or descriptions.",
    ),
  expectedAction: z
    .string()
    .describe(
      "The category of resolution needed (e.g., 'configuration guidance', 'bug fix', 'feature explanation', 'documentation').",
    ),
});

export const summarizeThread = async (
  thread: InferLiveObject<
    typeof schema.thread,
    { messages: true; labels: { label: true } }
  >,
) => {
  const firstMessage = thread.messages?.sort((a, b) =>
    a.id.localeCompare(b.id),
  )[0];
  const activeLabels = thread.labels
    ?.filter((l) => l.label?.enabled)
    .map((l) => l.label?.name)
    .join(", ");

  const prompt = `
You are a support thread analyzer optimized for semantic similarity matching. Your goal is to extract the CORE INTENT and UNDERLYING PROBLEM from a support thread, ignoring surface-level noise.

## Thread Data
**Title:**
${thread.name ?? "No title available."}

**First Message:**
${firstMessage?.content ?? "No message content available."}

**Applied Labels:**
${activeLabels || "None"}

---

## Instructions

Analyze this thread to identify what the user ACTUALLY needs, not just what they literally said. Focus on:

1. **Core Problem Identification**: What is the fundamental issue? Strip away:
   - Emotional language ("frustrated", "urgent", "desperately need")
   - Circumstantial details that don't define the problem
   - User's attempted solutions (focus on what they're trying to achieve)
   - Politeness phrases or greetings

2. **Semantic Normalization**: Use consistent, canonical terminology:
   - Prefer generic terms over brand-specific when the brand isn't essential
   - Use standard technical vocabulary (e.g., "authentication" not "logging in stuff")
   - Normalize synonyms (choose ONE term: "crash" vs "freeze" vs "hang" → pick the most accurate)

3. **Intent Classification**: Identify the underlying user goal:
   - Is this a "how to" question disguised as a bug report?
   - Is this a feature request framed as a complaint?
   - Is this a configuration issue presented as a bug?

4. **Avoid These Traps**:
   - Don't include the user's proposed solution as the problem
   - Don't add keywords for every noun mentioned
   - Don't describe the thread itself (e.g., "user reports issue")
   - Don't include time-sensitive or instance-specific details

## Output Guidelines

- **title**: A normalized, searchable problem statement (not a ticket title)
- **shortDescription**: The distilled problem + context needed to understand it
- **keywords**: Only terms that would help find SIMILAR problems (max 5-7)
- **entities**: Technical components, features, or systems involved (not actions)
- **expectedAction**: The type of resolution needed (e.g., "configuration guidance", "bug fix", "documentation clarification")

Think: "If another user has the exact same underlying problem with different wording, would this summary match theirs?"
  `;

  const { output } = await generateText({
    model: google("gemini-3-flash-preview"),
    output: Output.object({ schema: summarySchema }),
    prompt,
  });

  return `
  Title: ${output.title}
  Short Description: ${output.shortDescription}
  Keywords: ${output.keywords.join(", ")}
  Entities: ${output.entities.join(", ")}
  Expected Action: ${output.expectedAction}
  `;
};
