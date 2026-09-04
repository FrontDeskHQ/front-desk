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
