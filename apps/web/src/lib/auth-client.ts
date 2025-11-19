import { oneTimeTokenClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getBaseApiUrl } from "./urls";

export const authClient = createAuthClient({
  baseURL: getBaseApiUrl() as string,
  plugins: [oneTimeTokenClient()],
});
