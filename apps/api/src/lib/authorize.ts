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

export type IsAuthorizedOpts =
  | { mode: "internalOnly" }
  | {
      organizationId: string;
      role?: string;
      allowPublicApiKey?: boolean;
    };

type IsAuthorizedFn = (
  ctx: AuthorizedContext,
  opts: IsAuthorizedOpts,
) => [boolean, { organizationId: string; role: string } | null];

export function isAuthorized(
  ctx: AuthorizedContext,
  opts: { mode: "internalOnly" },
): [boolean, null];
export function isAuthorized(
  ctx: AuthorizedContext,
  opts: {
    organizationId: string;
    role?: string;
    allowPublicApiKey?: boolean;
  },
): [boolean, { organizationId: string; role: string } | null];
export function isAuthorized(
  ctx: AuthorizedContext,
  opts: IsAuthorizedOpts,
): [boolean, { organizationId: string; role: string } | null] {
  if ("mode" in opts && opts.mode === "internalOnly") {
    return [Boolean(ctx.internalApiKey), null];
  }

  const orgOpts = opts as Extract<IsAuthorizedOpts, { organizationId: string }>;

  if (ctx.internalApiKey) return [true, null];

  if (ctx.publicApiKey) {
    return [
      orgOpts.allowPublicApiKey === true &&
        ctx.publicApiKey.ownerId === orgOpts.organizationId,
      null,
    ];
  }

  if (ctx.orgUsers) {
    const orgUser = ctx.orgUsers.find(
      (ou) => ou.organizationId === orgOpts.organizationId,
    );

    if (!orgUser) return [false, null];

    if (orgOpts.role) {
      const requiredLevel = ROLE_HIERARCHY[orgOpts.role] ?? 0;
      const userLevel = ROLE_HIERARCHY[orgUser.role] ?? 0;
      return [userLevel >= requiredLevel, orgUser];
    }

    return [true, orgUser];
  }

  return [false, null];
}

export function authorize(
  ctx: AuthorizedContext,
  opts: { mode: "internalOnly" },
): null;
export function authorize(
  ctx: AuthorizedContext,
  opts: {
    organizationId: string;
    role?: string;
    allowPublicApiKey?: boolean;
  },
): { organizationId: string; role: string } | null;
export function authorize(
  ctx: AuthorizedContext,
  opts: IsAuthorizedOpts,
): { organizationId: string; role: string } | null {
  const [authorized, orgUser] = (isAuthorized as IsAuthorizedFn)(ctx, opts);

  if (authorized) return orgUser;

  throw new Error("UNAUTHORIZED");
}
