import { typesSupportingIssueCreation } from "@connectors/framework";
import { useLiveQuery } from "@live-state/sync/client";
import { linearIntegrationSchema } from "@workspace/schemas/integration/linear";
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
      z
        .object({
          fullName: z.string().min(1),
          name: z.string().regex(/^[^/]+$/),
          owner: z.string().regex(/^[^/]+$/),
        })
        // `fullName` is the label a human picks by; `owner`/`name` is what the
        // connector files into. If they disagree, the picker would show one
        // repository and the issue would land in another.
        .refine(
          ({ fullName, name, owner }) => fullName === `${owner}/${name}`,
          {
            message: "fullName must match owner/name",
          }
        )
    )
    .default([]),
});

const issueCreationTypes = new Set(typesSupportingIssueCreation());

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
  const linearIntegration = useLiveQuery(
    query.integration.first({
      enabled: true,
      organizationId,
      type: "linear",
    })
  );

  // Guarded after the hook so hook order stays stable. Without an org id the
  // query is unscoped and could surface another organization's integration.
  if (!organizationId) {
    return [];
  }

  const options: IssueTargetOption[] = [];
  if (issueCreationTypes.has("github") && githubIntegration?.configStr) {
    try {
      const config = githubConfigSchema.safeParse(
        JSON.parse(githubIntegration.configStr)
      );
      if (config.success) {
        options.push(
          ...config.data.repos.map((repo) => ({
            integrationId: githubIntegration.id,
            label: repo.fullName,
            target: { owner: repo.owner, repo: repo.name },
          }))
        );
      }
    } catch {
      // Ignore malformed provider config; it cannot produce a safe target.
    }
  }
  if (issueCreationTypes.has("linear") && linearIntegration?.configStr) {
    try {
      const config = linearIntegrationSchema.safeParse(
        JSON.parse(linearIntegration.configStr)
      );
      if (config.success) {
        options.push(
          ...config.data.teams.map((team) => ({
            integrationId: linearIntegration.id,
            label: `${team.key} — ${team.name}`,
            target: { teamId: team.id },
          }))
        );
      }
    } catch {
      // Ignore malformed provider config; it cannot produce a safe target.
    }
  }
  return options;
}
