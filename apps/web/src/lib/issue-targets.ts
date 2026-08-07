import { useLiveQuery } from "@live-state/sync/client";
import type { ExternalRepository } from "@workspace/schemas/external-issue";
import type { DefaultIssueTarget } from "@workspace/schemas/organization";

import { query } from "./live-state";

/**
 * The sub-resources an issue can be filed into, as
 * `{ label, target }` pairs ready to hand to `setDefaultIssueTarget` or
 * `acceptRead`. `target` is opaque to core — only the connector interprets it —
 * so it is built here, at the provider-aware config boundary, and forwarded
 * untouched from there on.
 *
 * Reading the GitHub config directly mirrors the thread issues panel: the
 * connect/config control plane stays provider-specific even though everything
 * downstream of it is capability-gated.
 */
export function useIssueTargetOptions(organizationId: string | undefined): {
  label: string;
  target: DefaultIssueTarget["target"];
}[] {
  const githubIntegration = useLiveQuery(
    query.integration.first({
      organizationId,
      type: "github",
    })
  );

  if (!githubIntegration?.configStr) {
    return [];
  }

  let repos: ExternalRepository[] = [];
  try {
    repos = JSON.parse(githubIntegration.configStr).repos ?? [];
  } catch {
    return [];
  }

  return repos.map((repo) => ({
    label: repo.fullName,
    target: { owner: repo.owner, repo: repo.name },
  }));
}
