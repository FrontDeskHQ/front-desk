const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  owner: 1,
};

const getRoleLevel = (role: string): number | undefined => {
  const level = ROLE_HIERARCHY[role];

  if (level === undefined) {
    console.warn(`[authorize] Unknown required role "${role}"`);
  }

  return level;
};

export type PortalSession = {
  session?: { userId?: string; userName?: string } | null;
  user?: { id?: string; name?: string } | null;
};

/** Context injected by live-state (sessions, API keys). */
export type AuthorizationContext = {
  internalApiKey?: unknown;
  publicApiKey?: { ownerId: string };
  orgUsers?: { organizationId: string; role: string }[];
  session?: { userId?: string } | null;
  user?: { name?: string } | null;
  portalSession?: PortalSession | null;
};

/** Request-like shape that carries credential context (e.g. mutation/query `req`). */
export type AuthorizeReq = {
  context?: AuthorizationContext | null;
};

export type AuthorizeOptions = {
  organizationId: string;
  role?: string;
  allowPublicApiKey?: boolean;
  /** Portal customer sessions (no org membership) may call org-scoped procedures. */
  allowPortalUser?: boolean;
  /**
   * When `true` (default), callers with {@link AuthorizationContext.internalApiKey}
   * are authorized without org membership checks. Set to `false` to enforce the
   * same membership rules as regular sessions even when an internal key is present.
   */
  allowInternalApiKey?: boolean;
};

export type ThreadCreateAuthInput = {
  organizationId: string;
  inputUserId?: string;
  hasIntegrationOnlyFields: boolean;
};

export type ThreadCreateAuthFlow =
  | "integration"
  | "public"
  | "portal"
  | "workspace";

export const getPortalUserId = (
  ctx: AuthorizationContext,
): string | undefined =>
  ctx.portalSession?.session?.userId ?? ctx.portalSession?.user?.id ?? undefined;

export const getWorkspaceUserId = (
  ctx: AuthorizationContext,
): string | undefined => ctx.session?.userId ?? undefined;

export const requireInternalApiKey = (
  ctx: AuthorizationContext | null | undefined,
): void => {
  if (!ctx?.internalApiKey) {
    throw new Error("UNAUTHORIZED");
  }
};

export const getWorkspaceActor = (
  req: AuthorizeReq,
): { userId: string; userName: string | null } => {
  const userId = getWorkspaceUserId(req.context ?? {});
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    userId,
    userName: req.context?.user?.name ?? null,
  };
};

export const getPortalAuthor = (
  req: AuthorizeReq,
  input: { userId?: string; userName?: string },
): { userId: string; userName: string } => {
  const ctx = req.context ?? {};
  const userId = input.userId ?? getPortalUserId(ctx);
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  const userName =
    input.userName ??
    ctx.portalSession?.session?.userName ??
    ctx.portalSession?.user?.name ??
    "Unknown User";

  return { userId, userName };
};

export const getCallerUserId = (req: AuthorizeReq): string | undefined => {
  const ctx = req.context ?? {};
  return getPortalUserId(ctx) ?? getWorkspaceUserId(ctx);
};

export const resolveHumanAuthor = (
  req: AuthorizeReq,
  input: { userId?: string; userName?: string },
): { userId: string; userName: string } => {
  const ctx = req.context ?? {};

  if (getPortalUserId(ctx) !== undefined) {
    return getPortalAuthor(req, input);
  }

  const actor = getWorkspaceActor(req);
  const userName = input.userName ?? actor.userName;
  if (!userName) {
    throw new Error("MISSING_USER_ID_OR_NAME");
  }

  return {
    userId: input.userId ?? actor.userId,
    userName,
  };
};

export const assertIntegrationAuthor = (req: AuthorizeReq): void => {
  const ctx = req.context ?? {};
  if (!ctx.internalApiKey && !ctx.publicApiKey) {
    throw new Error("UNAUTHORIZED");
  }
};

export const authorizeThreadCreate = (
  req: AuthorizeReq,
  input: ThreadCreateAuthInput,
): ThreadCreateAuthFlow => {
  const ctx = req.context ?? {};
  const hasInternalKey = !!ctx.internalApiKey;
  const hasPublicKey = !!ctx.publicApiKey;
  const portalUserId = getPortalUserId(ctx);
  const hasPortalSession = portalUserId !== undefined;
  const hasWorkspaceSession = getWorkspaceUserId(ctx) !== undefined;

  if (
    !hasInternalKey &&
    !hasPublicKey &&
    !hasPortalSession &&
    !hasWorkspaceSession
  ) {
    throw new Error("UNAUTHORIZED");
  }

  if (!hasInternalKey && !hasPublicKey && input.hasIntegrationOnlyFields) {
    throw new Error("UNAUTHORIZED");
  }

  if (hasPortalSession) {
    if (input.inputUserId && input.inputUserId !== portalUserId) {
      throw new Error("UNAUTHORIZED");
    }
    return "portal";
  }

  if (hasWorkspaceSession && !hasInternalKey && !hasPublicKey) {
    authorize(req, { organizationId: input.organizationId });
    return "workspace";
  }

  if (hasPublicKey) {
    return "public";
  }

  return "integration";
};

export const assertInternalKeyForIntegrationFields = (
  req: AuthorizeReq,
  fields: {
    recordActivity?: unknown;
    activityMetadata?: unknown;
    replicatedStr?: unknown;
  },
): void => {
  if (req.context?.internalApiKey) {
    return;
  }

  if (
    fields.recordActivity !== undefined ||
    fields.activityMetadata !== undefined ||
    fields.replicatedStr !== undefined
  ) {
    throw new Error("UNAUTHORIZED");
  }
};

export const isAuthorized = (
  ctx: AuthorizationContext,
  opts: AuthorizeOptions,
): boolean => {
  if (!!ctx.internalApiKey && opts.allowInternalApiKey !== false) {
    return true;
  }

  if (ctx.publicApiKey) {
    return (
      opts.allowPublicApiKey === true &&
      ctx.publicApiKey.ownerId === opts.organizationId
    );
  }

  if (opts.allowPortalUser && getPortalUserId(ctx) !== undefined) {
    return true;
  }

  if (ctx.orgUsers) {
    const orgUser = ctx.orgUsers.find(
      (ou) => ou.organizationId === opts.organizationId,
    );

    if (!orgUser) return false;

    if (opts.role) {
      const requiredLevel = getRoleLevel(opts.role);
      if (requiredLevel === undefined) return false;
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
