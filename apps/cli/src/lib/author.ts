export const fdAuthorMetaId = (organizationId: string, name: string): string =>
  `fd-${organizationId}-${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
