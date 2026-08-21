import { ReflagClient } from "@reflag/node-sdk";

// Create a singleton instance of the Reflag client
export const reflagClient = new ReflagClient({
  secretKey: process.env.REFLAG_SECRET_KEY,
});

/**
 * Load flag definitions before either service accepts work. Reflag returns no
 * flags when queried before initialization, which otherwise looks identical to
 * an intentionally disabled feature.
 */
export const initializeFeatureFlags = async (): Promise<void> => {
  await reflagClient.initialize();
};

export const isOrganizationFeatureEnabled = (
  organizationId: string,
  flag: string
): boolean =>
  reflagClient.bindClient({ company: { id: organizationId } }).getFlag(flag)
    .isEnabled;

export const SUPPORT_INTELLIGENCE_PIPELINE_FLAG =
  "support-intelligence-pipeline";

const LOCAL_DEVELOPMENT_ENVIRONMENTS = new Set([
  "development",
  "local",
  "test",
]);

const isLocalDevelopment = (environment = process.env.NODE_ENV): boolean =>
  environment !== undefined &&
  LOCAL_DEVELOPMENT_ENVIRONMENTS.has(environment.toLowerCase());

/**
 * False when this org should not run worker pipeline jobs. Always on in
 * explicit local environments. An unset or unknown NODE_ENV is not local —
 * the flag stays enforced.
 */
export const areWorkerJobsEnabled = (organizationId: string): boolean =>
  isLocalDevelopment() ||
  isOrganizationFeatureEnabled(
    organizationId,
    SUPPORT_INTELLIGENCE_PIPELINE_FLAG
  );
