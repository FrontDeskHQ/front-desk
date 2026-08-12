// The server looks authors up by (metaId, organizationId), and the private API
// key already fixes the organization — so the namespace only needs to separate
// fd-seeded authors from in-browser Devtools ones.
export const fdAuthorMetaId = (name: string): string =>
  `fd-${name.trim().toLowerCase().replaceAll(/\s+/g, "-")}`;
