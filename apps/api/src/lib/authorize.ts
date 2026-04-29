const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  owner: 1,
};

/** Context injected by live-state (sessions, API keys). */
export type AuthorizationContext = {
  internalApiKey?: unknown;
  publicApiKey?: { ownerId: string };
  orgUsers?: { organizationId: string; role: string }[];
};

/** Request-like shape that carries credential context (e.g. mutation/query `req`). */
export type AuthorizeReq = {
  context?: AuthorizationContext | null;
};

export type AuthorizeOptions = {
  organizationId: string;
  role?: string;
  allowPublicApiKey?: boolean;
  /**
   * When `true` (default), callers with {@link AuthorizationContext.internalApiKey}
   * are authorized without org membership checks. Set to `false` to enforce the
   * same membership rules as regular sessions even when an internal key is present.
   */
  allowInternalApiKey?: boolean;
};

export const isAuthorized = (
  ctx: AuthorizationContext,
  opts: AuthorizeOptions,
): boolean => {
  if (
    !!ctx.internalApiKey &&
    opts.allowInternalApiKey !== false
  ) {
    return true;
  }

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
};

export const authorize = (req: AuthorizeReq, opts: AuthorizeOptions): void => {
  if (isAuthorized(req.context ?? {}, opts)) return;

  throw new Error("UNAUTHORIZED");
};
