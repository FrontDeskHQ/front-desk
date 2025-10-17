import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authClient } from "../auth-client";

export const getAuthUser = createServerFn({
  method: "GET",
}).handler(async () => {
  const res = await authClient.getSession({
    fetchOptions: {
      headers: getRequestHeaders() as HeadersInit,
    },
  });

  return res.data;
});
