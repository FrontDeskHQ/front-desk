import type { Action } from "@workspace/schemas/signals";

export interface VerifiedPrDetails {
  number?: number;
  url: string;
}

interface ToolStep {
  toolResults: {
    toolName: string;
    output: unknown;
  }[];
}

/**
 * Collect verified PR metadata from successful read_pr calls. The model may
 * only link URLs returned by this trust-boundary lookup.
 */
export const collectVerifiedPrDetailsFromToolSteps = (
  steps: ToolStep[]
): Map<string, VerifiedPrDetails> => {
  const verified = new Map<string, VerifiedPrDetails>();

  for (const step of steps) {
    for (const result of step.toolResults) {
      if (result.toolName !== "read_pr") {
        continue;
      }
      const output = result.output as
        | {
            found?: boolean;
            pr?: { number?: number; url?: string };
          }
        | null
        | undefined;
      const url = output?.found === true ? output.pr?.url?.trim() : undefined;
      if (url) {
        const number =
          output?.found === true && typeof output.pr?.number === "number"
            ? output.pr.number
            : undefined;
        verified.set(url, {
          number,
          url,
        });
      }
    }
  }

  return verified;
};

/**
 * Collect PR URLs that were successfully returned by `read_pr` tool calls.
 * Only these URLs may appear in emitted `link_pr` actions — prompt instructions
 * alone are not a trust boundary (prompt injection / model bypass).
 */
export const collectVerifiedPrUrlsFromToolSteps = (
  steps: ToolStep[]
): Set<string> => {
  return new Set(collectVerifiedPrDetailsFromToolSteps(steps).keys());
};

/**
 * Ensure a primary link_pr recommendation contains the exact verified PR
 * Markdown link that RichMarkdown turns into a PR chip. If the model omitted
 * or mismatched the link, use a conservative action-aligned fallback.
 */
export const ensureVerifiedPrRecommendationLink = (
  recommendation: string,
  primary: Action[],
  verifiedPrs: Map<string, VerifiedPrDetails>
): string => {
  const linkPr = primary.find((action) => action.kind === "link_pr");
  if (!linkPr || linkPr.kind !== "link_pr") {
    return recommendation;
  }

  const prUrl = linkPr.prUrl.trim();
  const verifiedPr = verifiedPrs.get(prUrl);
  if (!verifiedPr || recommendation.includes(`](${prUrl})`)) {
    return recommendation;
  }

  const prLabel = verifiedPr.number
    ? `PR #${verifiedPr.number}`
    : "pull request";
  const prLink = `[${prLabel}](${prUrl})`;
  const hasReply = primary.some((action) => action.kind === "reply");

  return hasReply
    ? `Link ${prLink} to the thread and reply to tell the customer that engineering is working on the fix.`
    : `Link ${prLink} to the thread.`;
};

/** Drop `link_pr` actions whose `prUrl` was not returned by a successful `read_pr`. */
export const filterLinkPrToVerifiedUrls = <
  T extends { kind: string; prUrl?: string },
>(
  actions: T[],
  verifiedPrUrls: Set<string>
): T[] =>
  actions.filter((action) => {
    if (action.kind !== "link_pr") {
      return true;
    }
    const prUrl = action.prUrl?.trim() ?? "";
    return prUrl.length > 0 && verifiedPrUrls.has(prUrl);
  });

/**
 * Filter `link_pr` to verified URLs. If primary loses any `link_pr`, discard the
 * whole action set — recommendation (and often the reply draft) were written
 * assuming that link and would be stale relative to remaining actions.
 */
export const filterActionSetToVerifiedLinkPr = <
  T extends { kind: string; prUrl?: string },
>(
  primary: T[],
  alternatives: T[],
  verifiedPrUrls: Set<string>
): { primary: T[]; alternatives: T[] } => {
  const filteredPrimary = filterLinkPrToVerifiedUrls(primary, verifiedPrUrls);
  if (filteredPrimary.length !== primary.length) {
    return { alternatives: [], primary: [] };
  }
  return {
    alternatives: filterLinkPrToVerifiedUrls(alternatives, verifiedPrUrls),
    primary: filteredPrimary,
  };
};
