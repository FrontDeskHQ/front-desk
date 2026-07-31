import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

const FALLBACK_URL = "https://tryfrontdesk.app";

export const getBaseUrl = createIsomorphicFn()
  .server(() => {
    try {
      const url = getRequestUrl();
      return `${url.protocol}//${url.host}`;
    } catch {
      return import.meta.env.VITE_BASE_URL ?? FALLBACK_URL;
    }
  })
  .client(() => {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}`;
    }
    return FALLBACK_URL;
  });

export const getCurrentUrl = createIsomorphicFn()
  .server(() => {
    try {
      const url = getRequestUrl();
      return url.toString();
    } catch {
      return import.meta.env.VITE_BASE_URL ?? FALLBACK_URL;
    }
  })
  .client(() => {
    if (typeof window !== "undefined") {
      return window.location.href;
    }
    return FALLBACK_URL;
  });

/** Absolute URL for an imported asset, for meta tags that require one. */
export const absoluteAssetUrl = (asset: string) => {
  if (asset.startsWith("http")) {
    return asset;
  }
  return `${getBaseUrl()}${asset.startsWith("/") ? asset : `/${asset}`}`;
};
