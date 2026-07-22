/**
 * Build a customer-portal URL for a thread on the org's subdomain. FrontDesk
 * rewrites `{org}.tryfrontdesk.app` to the internal support path, so the portal
 * link is the base url with the org slug prepended as a subdomain.
 */
export const buildPortalThreadUrl = (
  baseUrl: string,
  organizationSlug: string,
  threadId: string
): string => {
  const baseUrlObj = new URL(baseUrl);
  const port = baseUrlObj.port ? `:${baseUrlObj.port}` : "";
  return `${baseUrlObj.protocol}//${organizationSlug}.${baseUrlObj.hostname}${port}/threads/${threadId}`;
};
