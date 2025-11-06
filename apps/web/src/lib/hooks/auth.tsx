import { useRouter } from "@tanstack/react-router";
import type { WindowWithCachedOrgUsers } from "~/routes/app/_workspace/route";
import type { WindowWithCachedSession } from "~/routes/app/route";
import { authClient } from "../auth-client";

export const useLogout = () => {
  const router = useRouter();

  return () =>
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          if (typeof window !== "undefined") {
            (window as WindowWithCachedSession).cachedSession = null;
            (window as WindowWithCachedOrgUsers).cachedOrgUsers = undefined;
          }
          router.navigate({ to: "/" });
        },
      },
    });
};
