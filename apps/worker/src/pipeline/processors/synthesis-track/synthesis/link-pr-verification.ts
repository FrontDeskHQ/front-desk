/**
 * Collect PR URLs that were successfully returned by `read_pr` tool calls.
 * Only these URLs may appear in emitted `link_pr` actions — prompt instructions
 * alone are not a trust boundary (prompt injection / model bypass).
 */
export const collectVerifiedPrUrlsFromToolSteps = (
  steps: {
    toolResults: {
      toolName: string;
      output: unknown;
    }[];
  }[]
): Set<string> => {
  const verified = new Set<string>();

  for (const step of steps) {
    for (const result of step.toolResults) {
      if (result.toolName !== "read_pr") {
        continue;
      }
      const output = result.output as
        | { found?: boolean; pr?: { url?: string } }
        | null
        | undefined;
      const url = output?.found === true ? output.pr?.url?.trim() : undefined;
      if (url) {
        verified.add(url);
      }
    }
  }

  return verified;
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
