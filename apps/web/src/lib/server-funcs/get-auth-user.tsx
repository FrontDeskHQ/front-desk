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

  // DEBUG: Pure fetch equivalent
  const authBaseURL =
    import.meta.env.VITE_AUTH_SERVER_BASE_URL ?? "http://localhost:3333";
  const sessionUrl = `${authBaseURL}/api/auth/get-session`;
  const headers = Object.fromEntries(getRequestHeaders()) as HeadersInit;

  console.log("DEBUG: Fetching session from:", sessionUrl);
  console.log("DEBUG: Headers:", JSON.stringify(headers, null, 2));

  try {
    const fetchRes = await fetch(sessionUrl, {
      method: "GET",
      headers,
      credentials: "include",
    });

    console.log("DEBUG: Fetch status:", fetchRes.status);
    console.log("DEBUG: Fetch statusText:", fetchRes.statusText);
    console.log(
      "DEBUG: Fetch headers:",
      JSON.stringify(Object.fromEntries(fetchRes.headers.entries()), null, 2),
    );

    const fetchData = await fetchRes.text();
    console.log("DEBUG: Fetch raw response:", fetchData);

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(fetchData);
      console.log(
        "DEBUG: Fetch parsed response:",
        JSON.stringify(parsedData, null, 2),
      );
    } catch (e) {
      console.error("DEBUG: Failed to parse fetch response as JSON:", e);
      console.log("DEBUG: Response is not JSON");
    }

    if (!fetchRes.ok) {
      console.error("DEBUG: Fetch failed with status:", fetchRes.status);
    }
  } catch (fetchError) {
    console.error("DEBUG: Fetch error:", fetchError);
    if (fetchError instanceof Error) {
      console.error("DEBUG: Fetch error message:", fetchError.message);
      console.error("DEBUG: Fetch error stack:", fetchError.stack);
    }
  }

  return res.data;
});
