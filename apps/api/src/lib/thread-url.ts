export const requireFrontendBaseUrl = (
  baseUrl = process.env.BASE_FRONTEND_URL
): string => {
  if (!baseUrl) {
    throw new Error("MISSING_BASE_FRONTEND_URL");
  }
  return baseUrl;
};

export const buildWorkspaceThreadUrl = (
  baseUrl: string,
  threadId: string
): string => {
  const url = new URL(baseUrl);
  url.pathname = `/app/threads/${encodeURIComponent(threadId)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
};
