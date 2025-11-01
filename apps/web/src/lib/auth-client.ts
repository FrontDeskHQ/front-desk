import { oneTimeTokenClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.VITE_AUTH_SERVER_BASE_URL ?? "http://localhost:3333", // The base URL of your auth server
  plugins: [oneTimeTokenClient()],
});
