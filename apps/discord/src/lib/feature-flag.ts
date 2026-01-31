import { ReflagClient } from "@reflag/node-sdk";

// Create a singleton instance of the Reflag client
// Uses REFLAG_SECRET_KEY environment variable automatically
export const reflagClient = new ReflagClient();
