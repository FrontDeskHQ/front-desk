import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";

const getApiUrl = () => import.meta.env.VITE_API_URL ?? "http://localhost:3333";

const getRequestTimeout = () => {
  const timeout = import.meta.env.VITE_API_TIMEOUT;
  return timeout ? Number.parseInt(timeout, 10) : 30_000; // Default 30 seconds
};

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: async ({ request, params }) => handleProxy(request, params),
    },
  },
});

const handleProxy = async (
  request: Request,
  params: Record<string, string | undefined>
): Promise<Response> => {
  const apiUrl = getApiUrl();
  const url = new URL(request.url);

  const referer = request.headers.get("referer");
  const clientOrigin =
    request.headers.get("origin") ||
    (referer ? new URL(referer).origin : null) ||
    url.origin;

  const pathMatch = url.pathname.match(/^\/api\/(.+)$/);
  const apiPath = pathMatch?.[1] ?? params.$ ?? params._splat ?? "";

  if (!apiPath) {
    return new Response(JSON.stringify({ error: "API path is required" }), {
      headers: {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Origin": clientOrigin,
        "Content-Type": "application/json",
      },
      status: 400,
      statusText: "Bad Request",
    });
  }

  const targetPath = `/api/${apiPath}`;
  const targetUrl = new URL(targetPath, apiUrl);

  url.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers(getRequestHeaders());

  headers.delete("host");
  headers.delete("connection");
  headers.delete("upgrade");

  request.headers.forEach((value, key) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });

  const fetchOptions: RequestInit = {
    headers,
    method: request.method,
    redirect: "manual",
  };

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "OPTIONS"
  ) {
    try {
      const clonedRequest = request.clone();
      const body = await clonedRequest.arrayBuffer();
      if (body.byteLength > 0) {
        fetchOptions.body = body;
      }
    } catch {}
  }

  const timeout = getRequestTimeout();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeout);

  fetchOptions.signal = abortController.signal;

  try {
    const response = await fetch(targetUrl.toString(), fetchOptions);

    clearTimeout(timeoutId);

    const responseHeaders = new Headers();

    response.headers.forEach((value, key) => {
      if (
        key.toLowerCase() !== "content-encoding" &&
        key.toLowerCase() !== "transfer-encoding"
      ) {
        responseHeaders.set(key, value);
      }
    });

    responseHeaders.set("Access-Control-Allow-Origin", clientOrigin);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    responseHeaders.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"
    );
    responseHeaders.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );

    const responseBody = await response.arrayBuffer();

    return new Response(responseBody, {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));

    return new Response(
      JSON.stringify({
        error: isTimeout ? "Request timeout" : "Failed to proxy request to API",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Origin": clientOrigin,
          "Content-Type": "application/json",
        },
        status: isTimeout ? 504 : 502,
        statusText: isTimeout ? "Gateway Timeout" : "Bad Gateway",
      }
    );
  }
};
