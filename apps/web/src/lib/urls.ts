import { createIsomorphicFn } from "@tanstack/react-start";

// When we run on Cloudflare, we use the API URL directly to avoid circular requests through the proxy
// When we run on localhost or client rendering, we use the base URL to share cookies via same-origin requests
export const getBaseApiUrl = createIsomorphicFn()
  .server(() => {
    return process.env.SERVER_ENV === "cloudflare"
      ? process.env.VITE_API_URL ?? "http://localhost:3333"
      : process.env.VITE_BASE_URL ?? "http://localhost:3000";
  })
  .client(() => {
    return import.meta.env.VITE_BASE_URL ?? "http://localhost:3000";
  });

export const getTenantBaseApiUrl = createIsomorphicFn()
  .server(({ slug }: { slug: string }) => {
    const baseApiUrl =
      process.env.SERVER_ENV === "cloudflare"
        ? process.env.VITE_API_URL ?? "http://localhost:3333"
        : process.env.VITE_BASE_URL ?? "http://localhost:3000";

    return `${baseApiUrl}/support/${slug}`;
  })
  .client(({ slug }: { slug: string }) => {
    const baseApiUrl = import.meta.env.VITE_BASE_URL ?? "http://localhost:3000";
    const parsedBaseUrl = new URL(baseApiUrl);
    parsedBaseUrl.hostname = `${slug}.${parsedBaseUrl.hostname}`;

    return parsedBaseUrl.toString().replace(/\/$/, "");
  });

export const getLiveStateApiUrl = createIsomorphicFn()
  .server(() => {
    return `${
      process.env.SERVER_ENV === "cloudflare"
        ? process.env.VITE_API_URL ?? "http://localhost:3333"
        : process.env.VITE_BASE_URL ?? "http://localhost:3000"
    }/api/ls`;
  })
  .client(() => {
    return "/api/ls";
  });
