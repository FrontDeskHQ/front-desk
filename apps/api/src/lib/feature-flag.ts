import { ReflagClient } from "@reflag/node-sdk";

// Create a singleton instance of the Reflag client
export const reflagClient = new ReflagClient({
  secretKey: process.env.REFLAG_SECRET_KEY,
});
