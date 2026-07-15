import type { Capability } from "./capabilities";

/**
 * A connector's static declaration. Ships with the connector and is the single
 * source of truth the core builds its registry from at boot. The dynamic,
 * per-org state (`enabled`, opaque `configStr`) lives on the `integration` row.
 */
export interface ConnectorManifest {
  /** Matches the `integration` row's `type` (e.g. `"github"`). */
  type: string;
  /** Capabilities this connector provides. */
  capabilities: Capability[];
  /** Env var holding the connector host's base URL. */
  baseUrlEnv: string;
  /** Fallback base URL for local dev. */
  defaultBaseUrl: string;
}

/**
 * GitHub connector manifest. Declares both `issue-tracker` and `pr-tracker`.
 * Kept here (dependency-free) rather than in the connector app so the core can
 * import it without pulling in octokit or creating a workspace cycle.
 */
export const githubManifest: ConnectorManifest = {
  type: "github",
  capabilities: ["issue-tracker", "pr-tracker"],
  baseUrlEnv: "BASE_GITHUB_SERVER_URL",
  defaultBaseUrl: "http://localhost:3334",
};

/**
 * Discord connector manifest. Declares the emitting `support-entry-point`
 * capability. Discord is emitting-only (it runs as a gateway bot and delivers
 * outbound via pull-based replication, per ADR-0009), so it exposes no invoke
 * HTTP endpoint; `baseUrlEnv`/`defaultBaseUrl` are unused for it and kept only
 * to satisfy the shared manifest shape.
 */
export const discordManifest: ConnectorManifest = {
  type: "discord",
  capabilities: ["support-entry-point"],
  baseUrlEnv: "BASE_DISCORD_SERVER_URL",
  defaultBaseUrl: "http://localhost:3335",
};

/**
 * Slack connector manifest. Declares the emitting `support-entry-point`
 * capability. Like Discord, Slack is emitting-only — it runs as a Bolt app and
 * delivers outbound via pull-based replication (per ADR-0009) — so it exposes no
 * invoke HTTP endpoint; `baseUrlEnv`/`defaultBaseUrl` are unused for it and kept
 * only to satisfy the shared manifest shape.
 */
export const slackManifest: ConnectorManifest = {
  type: "slack",
  capabilities: ["support-entry-point"],
  baseUrlEnv: "BASE_SLACK_SERVER_URL",
  defaultBaseUrl: "http://localhost:3336",
};

/** All known connector manifests. */
export const manifests: ConnectorManifest[] = [
  githubManifest,
  discordManifest,
  slackManifest,
];

/**
 * The integration `type`s whose manifest declares `capability`. Pure and
 * env-free (unlike the boot-time {@link ConnectorRegistry}, which resolves host
 * URLs from `process.env`), so it is safe to call from the browser: the web
 * client uses it to answer "which providers can offer this?" for gating.
 */
export function typesProvidingCapability(
  capability: Capability,
  manifestList: ConnectorManifest[] = manifests,
): string[] {
  return manifestList
    .filter((manifest) => manifest.capabilities.includes(capability))
    .map((manifest) => manifest.type);
}

/**
 * Whether any of `enabledTypes` provides `capability`. Env-free, client-safe
 * mirror of {@link ConnectorRegistry.hasCapability} — answers "can we offer
 * this?"; a specific invoked call still routes by a concrete target.
 */
export function typesHaveCapability(
  enabledTypes: Iterable<string>,
  capability: Capability,
  manifestList: ConnectorManifest[] = manifests,
): boolean {
  const providers = new Set(typesProvidingCapability(capability, manifestList));
  for (const type of enabledTypes) {
    if (providers.has(type)) return true;
  }
  return false;
}
