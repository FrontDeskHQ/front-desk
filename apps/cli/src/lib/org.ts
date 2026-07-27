import { fetchClient } from "./live-state.js";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export interface ResolvedOrganization {
  id: string;
  slug: string;
}

export const resolveOrganization = async (
  orgRef: string
): Promise<ResolvedOrganization> => {
  const trimmed = orgRef.trim();
  if (!trimmed) {
    throw new Error("Organization reference is required");
  }

  const organization = ULID_RE.test(trimmed)
    ? await fetchClient.query.organization.byId({ id: trimmed.toLowerCase() })
    : await fetchClient.query.organization.bySlug({
        slug: trimmed.toLowerCase(),
      });

  if (!organization) {
    throw new Error(`Organization not found: ${trimmed}`);
  }

  return { id: organization.id, slug: organization.slug };
};
