const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  owner: 1,
};

type AuthorizedContext = {
  internalApiKey?: unknown;
  publicApiKey?: { ownerId: string };
  orgUsers?: { organizationId: string; role: string }[];
};

export function getOrganizationUser(
  ctx: AuthorizedContext,
  opts: {
    organizationId: string;
  },
): { organizationId: string; role: string } | null {
  if (ctx.internalApiKey) return null;

  if (ctx.publicApiKey) return null;

  return (
    ctx.orgUsers?.find((ou) => ou.organizationId === opts.organizationId) ??
    null
  );
}

export function isAuthorized(
  ctx: AuthorizedContext,
  opts: {
    organizationId: string;
    role?: string;
    allowPublicApiKey?: boolean;
  },
): [boolean, { organizationId: string; role: string } | null] {
  if (ctx.internalApiKey) return [true, null];

  if (ctx.publicApiKey) {
    return [
      opts.allowPublicApiKey === true &&
        ctx.publicApiKey.ownerId === opts.organizationId,
      null,
    ];
  }

  if (ctx.orgUsers) {
    const orgUser = ctx.orgUsers.find(
      (ou) => ou.organizationId === opts.organizationId,
    );

    if (!orgUser) return [false, null];

    if (opts.role) {
      const requiredLevel = ROLE_HIERARCHY[opts.role] ?? 0;
      const userLevel = ROLE_HIERARCHY[orgUser.role] ?? 0;
      return [userLevel >= requiredLevel, orgUser];
    }

    return [true, orgUser];
  }

  return [false, null];
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
): { organizationId: string; role: string } | null => {
  const [authorized, orgUser] = isAuthorized(ctx, opts);

  if (authorized) return orgUser;

  throw new Error("UNAUTHORIZED");
};
