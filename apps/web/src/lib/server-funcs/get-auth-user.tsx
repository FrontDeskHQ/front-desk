import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authClient } from "../auth-client";

export const getAuthUser = createServerFn({
  method: "GET",
}).handler(async () => {
  console.log("getRequestHeaders()", getRequestHeaders());
  const res = await authClient.getSession({
    fetchOptions: {
      headers: getRequestHeaders() as HeadersInit,
    },
  });

  console.log("res", res);

  return res.data;
});
