import z from "zod";

interface ToolStep {
  toolResults: {
    input?: unknown;
    toolName: string;
    output: unknown;
  }[];
}

const readIssueOutputSchema = z.object({
  found: z.boolean().optional(),
  issue: z
    .object({
      externalKey: z.string().optional(),
      number: z.number().optional(),
      url: z.string().optional(),
    })
    .optional(),
});

export interface VerifiedIssueDetails {
  externalKey?: string;
  number?: number;
  url: string;
}

const searchIssuesInputSchema = z.object({ query: z.string().trim().min(1) });
const searchIssuesOutputSchema = z.object({
  hits: z.array(z.object({ url: z.string().trim().min(1) })),
  status: z.literal("ok"),
});

export interface VerifiedIssueSearch {
  candidateUrls: string[];
  query: string;
}

export const collectVerifiedIssueSearchesFromToolSteps = (
  steps: ToolStep[]
): VerifiedIssueSearch[] => {
  const searches: VerifiedIssueSearch[] = [];
  for (const step of steps) {
    for (const result of step.toolResults) {
      if (result.toolName !== "search_issues") continue;
      const input = searchIssuesInputSchema.safeParse(result.input);
      const output = searchIssuesOutputSchema.safeParse(result.output);
      if (!input.success || !output.success) continue;
      searches.push({
        candidateUrls: output.data.hits.map((hit) => hit.url),
        query: input.data.query,
      });
    }
  }
  return searches;
};

const SEARCH_STOP_WORDS = new Set([
  "after",
  "before",
  "issue",
  "request",
  "that",
  "this",
  "with",
]);

const significantTerms = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length >= 3 && !SEARCH_STOP_WORDS.has(term)) ?? []
  );

export const issueSearchQueryCoversAction = (
  query: string,
  action: { body?: string; title?: string }
): boolean => {
  const queryTerms = significantTerms(query);
  const actionTerms = significantTerms(
    `${action.title ?? ""} ${action.body ?? ""}`
  );
  const overlap = [...queryTerms].filter((term) => actionTerms.has(term));
  return overlap.length >= Math.min(2, queryTerms.size) && queryTerms.size > 0;
};

const verifiedSearchCoversAction = (
  search: VerifiedIssueSearch,
  action: { body?: string; title?: string },
  verifiedIssueUrls: Set<string>
): boolean => {
  if (
    search.candidateUrls.some(
      (candidateUrl) => !verifiedIssueUrls.has(candidateUrl)
    )
  ) {
    return false;
  }
  return issueSearchQueryCoversAction(search.query, action);
};

/**
 * Fail closed when `create_issue` lacks duplicate-search evidence. A relevant
 * successful search is required, and every candidate it returned must have
 * crossed the existing `read_issue` verification boundary.
 */
export const filterActionSetToVerifiedCreateIssue = <
  T extends { body?: string; kind: string; title?: string },
>(
  primary: T[],
  alternatives: T[],
  searches: VerifiedIssueSearch[],
  verifiedIssueUrls: Set<string>
): { primary: T[]; alternatives: T[] } => {
  const filter = (actions: T[]): T[] =>
    actions.filter(
      (action) =>
        action.kind !== "create_issue" ||
        searches.some((search) =>
          verifiedSearchCoversAction(search, action, verifiedIssueUrls)
        )
    );
  const filteredPrimary = filter(primary);
  if (filteredPrimary.length !== primary.length) {
    return { alternatives: [], primary: [] };
  }
  return { alternatives: filter(alternatives), primary: filteredPrimary };
};

/**
 * Collect issue URLs returned by successful `read_issue` calls. Only these may
 * appear in an emitted `link_issue` — prompt instructions are not a trust
 * boundary, and this pipeline now feeds the model untrusted external issue text
 * through three channels (`related_issues` evidence, `read_issue` bodies,
 * `search_issues` hits), any of which could carry an injected instruction.
 *
 * Deliberately narrower than the `link_pr` equivalent: there is no
 * recommendation-repair counterpart here. `link_pr` needs one because its
 * recommendation renders a PR chip from the exact verified URL; `link_issue`
 * has no such rendering, so repairing the sentence would add surface without
 * adding safety.
 */
export const collectVerifiedIssueDetailsFromToolSteps = (
  steps: ToolStep[]
): Map<string, VerifiedIssueDetails> => {
  const verified = new Map<string, VerifiedIssueDetails>();

  for (const step of steps) {
    for (const result of step.toolResults) {
      if (result.toolName !== "read_issue") {
        continue;
      }
      const parsedOutput = readIssueOutputSchema.safeParse(result.output);
      if (!parsedOutput.success || parsedOutput.data.found !== true) {
        continue;
      }
      const url = parsedOutput.data.issue?.url?.trim();
      if (url) {
        verified.set(url, {
          externalKey: parsedOutput.data.issue?.externalKey,
          number: parsedOutput.data.issue?.number,
          url,
        });
      }
    }
  }

  return verified;
};

export const collectVerifiedIssueUrlsFromToolSteps = (
  steps: ToolStep[]
): Set<string> =>
  new Set(collectVerifiedIssueDetailsFromToolSteps(steps).keys());

/** Drop `link_issue` actions whose `issueUrl` was not returned by a successful `read_issue`. */
export const filterLinkIssueToVerifiedUrls = <
  T extends { kind: string; issueUrl?: string },
>(
  actions: T[],
  verifiedIssueUrls: Set<string>
): T[] =>
  actions.filter((action) => {
    if (action.kind !== "link_issue") {
      return true;
    }
    const issueUrl = action.issueUrl?.trim() ?? "";
    return issueUrl.length > 0 && verifiedIssueUrls.has(issueUrl);
  });

/**
 * Filter `link_issue` to verified URLs. If primary loses any `link_issue`,
 * discard the whole action set — the recommendation (and often the reply draft)
 * were written assuming that link and would be stale against what remains.
 * Mirrors `filterActionSetToVerifiedLinkPr`.
 */
export const filterActionSetToVerifiedLinkIssue = <
  T extends { kind: string; issueUrl?: string },
>(
  primary: T[],
  alternatives: T[],
  verifiedIssueUrls: Set<string>
): { primary: T[]; alternatives: T[] } => {
  const filteredPrimary = filterLinkIssueToVerifiedUrls(
    primary,
    verifiedIssueUrls
  );
  if (filteredPrimary.length !== primary.length) {
    return { alternatives: [], primary: [] };
  }
  return {
    alternatives: filterLinkIssueToVerifiedUrls(
      alternatives,
      verifiedIssueUrls
    ),
    primary: filteredPrimary,
  };
};
