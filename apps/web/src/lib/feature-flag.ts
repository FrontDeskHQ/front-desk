import { ReflagClient } from "@reflag/browser-sdk";

export const reflagClient = new ReflagClient({
  publishableKey: import.meta.env.VITE_REFLAG_PUB_KEY,
});
