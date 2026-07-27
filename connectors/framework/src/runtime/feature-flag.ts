import { ReflagClient } from "@reflag/node-sdk";

/**
 * Create the connector's singleton Reflag (feature-flag) client. Identical setup
 * across discord/slack today; lifted so the `REFLAG_SECRET_KEY` wiring lives once.
 */
export const createReflagClient = (): ReflagClient =>
  new ReflagClient({ secretKey: process.env.REFLAG_SECRET_KEY });

export type { ReflagClient };
