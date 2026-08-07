import { useLiveQuery } from "@live-state/sync/client";
import type { DefaultIssueTarget } from "@workspace/schemas/organization";
import { z } from "zod";

import { query } from "./live-state";

export interface IssueTargetOption {
  /** The integration that owns this target, pinned onto the saved target so a
   * create can't be routed to a different tracker by the primary fallback. */
  integrationId: string;
  label: string;
  target: DefaultIssueTarget["target"];
}

/**
 * The connector config is opaque to core, so it is validated here rather than
 * trusted: a stale or hand-edited config could otherwise yield an entry with no
 * `fullName`, which becomes an `undefined` select value and a target that fails
 * `defaultIssueTargetSchema` on save.
 */
const githubConfigSchema = z.object({
  repos: z
    .array(
      z.object({
        fullName: z.string().min(1),
        name: z.string().min(1),
        owner: z.string().min(1),
      })
    )
    .default([]),
});

/**
 * The sub-resources an issue can be filed into, as options ready to hand to
 * `setDefaultIssueTarget` or `acceptRead`. `target` is opaque to core — only the
 * connector interprets it — so it is built here, at the provider-aware config
 * boundary, and forwarded untouched from there on.
 *
 * Reading the GitHub config directly mirrors the thread issues panel: the
 * connect/config control plane stays provider-specific even though everything
 * downstream of it is capability-gated.
 */
export function useIssueTargetOptions(
  organizationId: string | undefined
): IssueTargetOption[] {
  // Only enabled integrations: a disabled one still has cached repos, but every
  // save against it would fail with ISSUE_TRACKER_NOT_CONFIGURED.
  const githubIntegration = useLiveQuery(
    query.integration.first({
      enabled: true,
      organizationId,
      type: "github",
    })
  );

  // Guarded after the hook so hook order stays stable. Without an org id the
  // query is unscoped and could surface another organization's integration.
  if (!(organizationId && githubIntegration?.configStr)) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(githubIntegration.configStr);
  } catch {
    return [];
  }

  const config = githubConfigSchema.safeParse(parsed);
  if (!config.success) {
    return [];
  }

  return config.data.repos.map((repo) => ({
    integrationId: githubIntegration.id,
    label: repo.fullName,
    target: { owner: repo.owner, repo: repo.name },
  }));
}
