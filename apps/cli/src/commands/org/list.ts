import { assertLocalhostApiUrl, getApiUrl, getWebUrl } from "../../lib/env.js";
import { fetchClient } from "../../lib/live-state.js";

export interface OrgListItem {
  id: string;
  name: string;
  slug: string;
  url: string;
}

export interface OrgListOutput {
  organizations: OrgListItem[];
}

export const runOrgList = async (): Promise<{
  output: OrgListOutput;
  exitCode: number;
}> => {
  assertLocalhostApiUrl(getApiUrl());

  const webUrl = getWebUrl();
  const organizations = await fetchClient.query.organization.list();

  const items: OrgListItem[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    url: `${webUrl}/support/${org.slug}`,
  }));

  items.sort((a, b) => a.slug.localeCompare(b.slug));

  return {
    exitCode: 0,
    output: { organizations: items },
  };
};
