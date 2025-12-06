import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";

const getApiUrl = () => {
  return import.meta.env.VITE_API_URL ?? "http://localhost:3333";
};

const getRequestTimeout = () => {
  const timeout = import.meta.env.VITE_API_TIMEOUT;
  return timeout ? parseInt(timeout, 10) : 30000;
};

export const Route = createFileRoute("/support/$slug/api/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return handleProxy(request, params);
      },
      POST: async ({ request, params }) => {
        return handleProxy(request, params);
      },
      PUT: async ({ request, params }) => {
        return handleProxy(request, params);
      },
      PATCH: async ({ request, params }) => {
        return handleProxy(request, params);
      },
      DELETE: async ({ request, params }) => {
        return handleProxy(request, params);
      },
      OPTIONS: async ({ request, params }) => {
        return handleProxy(request, params);
      },
      HEAD: async ({ request, params }) => {
        return handleProxy(request, params);
      },
      ALL: async ({ request, params }) => {
        return handleProxy(request, params);
      },
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
      status: 400,
      statusText: "Bad Request",
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": clientOrigin,
        "Access-Control-Allow-Credentials": "true",
      },
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
    method: request.method,
    headers,
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
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
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
        status: isTimeout ? 504 : 502,
        statusText: isTimeout ? "Gateway Timeout" : "Bad Gateway",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": clientOrigin,
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }
};
