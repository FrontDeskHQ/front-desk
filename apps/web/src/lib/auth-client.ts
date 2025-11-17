import { oneTimeTokenClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BASE_URL ?? "http://localhost:3000", // The base URL of your auth server
  plugins: [oneTimeTokenClient()],
});
