import type { Hints, ReplyGrounding } from "@workspace/schemas/signals";
import { inferredGrounding } from "@workspace/schemas/signals";
import z from "zod";

interface ToolStep {
  toolResults: {
    toolName: string;
    output: unknown;
  }[];
}

const searchDocumentationOutputSchema = z.object({
  hits: z.array(z.object({ pageUrl: z.string().optional() })).optional(),
});

const readDocumentationPageOutputSchema = z.object({
  chunks: z.array(z.object({ pageUrl: z.string().optional() })).optional(),
  pageUrl: z.string().optional(),
});

/**
 * Every documentation page this run actually retrieved: the `related_docs` hint
 * bag plus anything the agent pulled with its own tools. Both halves are
 * needed — `search_documentation` exists because the bag misses things, and the
 * best-grounded replies are the ones where the agent went looking.
 *
 * A page read with no chunks does not count. The tool returns empty on backend
 * failure, and "we tried to read it" is not evidence.
 */
export const collectRetrievedDocUrls = (
  steps: ToolStep[],
  hints: Hints
): Set<string> => {
  const retrieved = new Set<string>();

  for (const doc of hints.related_docs?.evidence?.docs ?? []) {
    const url = doc.url?.trim() || doc.docId.trim();
    if (url) {
      retrieved.add(url);
    }
  }

  for (const step of steps) {
    for (const result of step.toolResults) {
      if (result.toolName === "search_documentation") {
        const parsed = searchDocumentationOutputSchema.safeParse(result.output);
        for (const hit of parsed.success ? (parsed.data.hits ?? []) : []) {
          const url = hit.pageUrl?.trim();
          if (url) {
            retrieved.add(url);
          }
        }
        continue;
      }

      if (result.toolName === "read_documentation_page") {
        const parsed = readDocumentationPageOutputSchema.safeParse(
          result.output
        );
        if (!parsed.success || (parsed.data.chunks?.length ?? 0) === 0) {
          continue;
        }
        const url = parsed.data.pageUrl?.trim();
        if (url) {
          retrieved.add(url);
        }
      }
    }
  }

  return retrieved;
};

/**
 * The trust boundary for a reply's [grounding](../../../../../CONTEXT.md): a
 * `documented` claim survives only if every page it cites was retrieved on this
 * run. Anything else degrades to `inferred` — the honest description of a draft
 * whose sources cannot be shown. Degrade rather than drop: a fabricated
 * citation is a reason to withhold autonomy, not to throw away a draft a human
 * might still want to send.
 *
 * `state_report` is checked later instead, by the gate: it needs the
 * post-policy action set, which does not exist yet here.
 */
export const verifyReplyGrounding = (
  grounding: ReplyGrounding | undefined,
  retrievedDocUrls: Set<string>
): ReplyGrounding => {
  if (!grounding || grounding.class === "inferred") {
    return inferredGrounding();
  }

  if (grounding.class === "state_report") {
    return grounding;
  }

  const sources = grounding.sources
    .map((source) => source.trim())
    .filter(Boolean);

  if (
    sources.length === 0 ||
    sources.some((source) => !retrievedDocUrls.has(source))
  ) {
    return inferredGrounding();
  }

  return { ...grounding, sources };
};
