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
