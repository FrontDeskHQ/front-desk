import { oneTimeTokenClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const baseURL = import.meta.env.VITE_BASE_URL ?? "http://localhost:3000";

console.log("[Auth Client] Initializing auth client", {
  baseURL,
  env: import.meta.env.VITE_BASE_URL,
});

export const authClient = createAuthClient({
  baseURL, // The base URL of your auth server
  plugins: [oneTimeTokenClient()],
});

// This is used to fetch session data from the server, since calling a worker from itself doesn't work
export const serverAuthClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3333",
  plugins: [oneTimeTokenClient()],
});
