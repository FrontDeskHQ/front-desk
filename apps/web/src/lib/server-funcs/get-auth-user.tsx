import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authClient } from "../auth-client";

export const getAuthUser = createServerFn({
  method: "GET",
}).handler(async () => {
  console.log(
    "getRequestHeaders()",
    JSON.stringify(Object.fromEntries(getRequestHeaders()), null, 2),
  );

  const res = await authClient.getSession({
    fetchOptions: {
      onError: (error) => {
        console.error(
          "Error fetching auth session:",
          JSON.stringify(error, null, 2),
        );
      },
      onSuccess: (data) => {
        console.log(
          "Success fetching auth session:",
          JSON.stringify(data, null, 2),
        );
      },
      onResponse(context) {
        console.log("Response:", JSON.stringify(context, null, 2));
      },
      onRequest: () => {
        console.log("Requesting auth session");
      },
      headers: Object.fromEntries(getRequestHeaders()) as HeadersInit,
    },
  });

  console.log("res", JSON.stringify(res, null, 2));

  return res.data;
});
