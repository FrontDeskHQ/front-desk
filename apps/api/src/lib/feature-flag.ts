import { ReflagClient } from "@reflag/node-sdk";

// Create a singleton instance of the Reflag client
export const reflagClient = new ReflagClient({
  secretKey: process.env.REFLAG_SECRET_KEY,
});

export const isOrganizationFeatureEnabled = (
  organizationId: string,
  flag: string
): boolean =>
  reflagClient.bindClient({ company: { id: organizationId } }).getFlag(flag)
    .isEnabled;

export const SUPPORT_INTELLIGENCE_PIPELINE_FLAG =
  "support-intelligence-pipeline";

/**
 * False when this org should not run worker pipeline jobs. Always on outside
 * production. Pass the resolved tenant — a missing id cannot evaluate the flag.
 */
export const areWorkerJobsEnabled = (organizationId: string): boolean =>
  process.env.NODE_ENV !== "production" ||
  isOrganizationFeatureEnabled(
    organizationId,
    SUPPORT_INTELLIGENCE_PIPELINE_FLAG
  );
