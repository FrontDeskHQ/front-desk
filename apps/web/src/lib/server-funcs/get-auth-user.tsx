import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authClient } from "../auth-client";

export const getAuthUser = createServerFn({
  method: "GET",
}).handler(async () => {
  console.log(
    "getRequestHeaders()",
    JSON.stringify(getRequestHeaders(), null, 2),
  );
  const res = await authClient.getSession({
    fetchOptions: {
      headers: getRequestHeaders() as HeadersInit,
    },
  });

  console.log("res", JSON.stringify(res, null, 2));

  return res.data;
});
