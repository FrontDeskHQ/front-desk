import { createIsomorphicFn } from "@tanstack/react-start";

// When we run on Cloudflare, we use the API URL directly to avoid circular requests through the proxy
// When we run on localhost or client rendering, we use the base URL to share cookies via same-origin requests
export const getBaseApiUrl = createIsomorphicFn()
  .server(() => {
    console.log("[getBaseApiUrl] Server environment", process.env.SERVER_ENV);
    console.log("[getBaseApiUrl] API URL", process.env.VITE_API_URL);
    console.log("[getBaseApiUrl] Base URL", process.env.VITE_BASE_URL);
    console.log(
      "[getBaseApiUrl] Returning URL",
      process.env.SERVER_ENV === "cloudflare"
        ? process.env.VITE_API_URL ?? "http://localhost:3333"
        : process.env.VITE_BASE_URL ?? "http://localhost:3000"
    );
    return process.env.SERVER_ENV === "cloudflare"
      ? process.env.VITE_API_URL ?? "http://localhost:3333"
      : process.env.VITE_BASE_URL ?? "http://localhost:3000";
  })
  .client(() => {
    return import.meta.env.VITE_BASE_URL ?? "http://localhost:3000";
  });

export const getLiveStateApiUrl = () => `${getBaseApiUrl()}/api/ls`;
