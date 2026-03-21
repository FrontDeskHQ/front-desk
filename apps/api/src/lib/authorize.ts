const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  owner: 1,
};

export function isAuthorized(
  ctx: {
    internalApiKey?: unknown;
    publicApiKey?: { ownerId: string };
    orgUsers?: { organizationId: string; role: string }[];
  },
  opts: {
    organizationId: string;
    role?: string;
    allowPublicApiKey?: boolean;
  },
): boolean {
  if (ctx.internalApiKey) return true;

  if (ctx.publicApiKey) {
    return (
      opts.allowPublicApiKey === true &&
      ctx.publicApiKey.ownerId === opts.organizationId
    );
  }

  if (ctx.orgUsers) {
    const orgUser = ctx.orgUsers.find(
      (ou) => ou.organizationId === opts.organizationId,
    );

    if (!orgUser) return false;

    if (opts.role) {
      const requiredLevel = ROLE_HIERARCHY[opts.role] ?? 0;
      const userLevel = ROLE_HIERARCHY[orgUser.role] ?? 0;
      return userLevel >= requiredLevel;
    }

    return true;
  }

  return false;
}

export const authorize = (
  ctx: {
    internalApiKey?: unknown;
    publicApiKey?: { ownerId: string };
    orgUsers?: { organizationId: string; role: string }[];
  },
  opts: {
    organizationId: string;
    role?: string;
    allowPublicApiKey?: boolean;
  },
): void => {
  if (isAuthorized(ctx, opts)) return;

  throw new Error("UNAUTHORIZED");
};
