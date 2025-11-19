import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authClient } from "../auth-client";

export const getAuthUser = createServerFn({
  method: "GET",
}).handler(async () => {
  console.log("[getAuthUser] Fetching session");
  console.log("[getAuthUser] Headers", Object.fromEntries(getRequestHeaders()));
  console.log("[getAuthUser] Base URL", import.meta.env.VITE_BASE_URL);
  const res = await authClient.getSession({
    fetchOptions: {
      headers: Object.fromEntries(getRequestHeaders()) as HeadersInit,
      onRequest: () => {
        console.log("[getAuthUser] Request started");
      },
      onSuccess: () => {
        console.log("[getAuthUser] Request successful");
      },
      onError: (error) => {
        console.error("[getAuthUser] Request error", error);
      },
      onFinally: () => {
        console.log("[getAuthUser] Request finished");
      },
    },
  });

  console.log("[getAuthUser] Session fetched", res.data);

  return res.data;
});

export type GetAuthUserResponse = Awaited<ReturnType<typeof getAuthUser>>;
