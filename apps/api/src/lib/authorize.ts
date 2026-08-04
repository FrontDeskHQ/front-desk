const ROLE_HIERARCHY: Record<string, number> = {
  owner: 1,
  user: 0,
};

const getRoleLevel = (role: string): number | undefined => {
  const level = ROLE_HIERARCHY[role];

  if (level === undefined) {
    console.warn(`[authorize] Unknown required role "${role}"`);
  }

  return level;
};

export interface PortalSession {
  session?: { userId?: string; userName?: string } | null;
  user?: { id?: string; name?: string } | null;
}

/** Context injected by live-state (sessions, API keys). */
export interface AuthorizationContext {
  internalApiKey?: unknown;
  publicApiKey?: { ownerId: string };
  orgUsers?: { organizationId: string; role: string }[];
  session?: { userId?: string } | null;
  user?: {
    email?: string;
    emailVerified?: boolean;
    name?: string;
  } | null;
  portalSession?: PortalSession | null;
  /** Organization resolved from the portal request origin (subdomain or /support/{slug}). */
  portalOrganizationId?: string;
}

/** Request-like shape that carries credential context (e.g. mutation/query `req`). */
export interface AuthorizeReq {
  context?: AuthorizationContext | null;
}

export interface AuthorizeOptions {
  organizationId?: string;
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
  /** When `true`, only {@link AuthorizationContext.internalApiKey} satisfies auth. */
  internalApiKeyOnly?: boolean;
}

export type DeveloperActionDenialReason =
  | "missing_session"
  | "non_internal_email"
  | "unverified_email"
  | "not_organization_member";

export interface DeveloperActionDeniedEvent {
  action: string;
  actorUserId: string | null;
  event: "developer_action.authorization_denied";
  organizationId: string;
  reason: DeveloperActionDenialReason;
}

export interface DeveloperActionAuthorizationOptions {
  /** Stable, known-ahead action name for structured denial logs. */
  action?: string;
  /** Override the runtime environment in tests or an embedding server. */
  environment?: string;
  /** Test/host hook; the default writes a JSON event to stderr. */
  onDenied?: (event: DeveloperActionDeniedEvent) => void;
}

const INTERNAL_DEVELOPER_DOMAIN = "tryfrontdesk.app";
const LOCAL_DEVELOPMENT_ENVIRONMENTS = new Set([
  "development",
  "local",
  "test",
]);

/**
 * The domain check is deliberately an exact mailbox-domain comparison. A
 * suffix check would accept lookalikes such as `tryfrontdesk.app.evil`.
 */
export const isInternalDeveloperEmail = (email?: string): boolean => {
  if (!email) {
    return false;
  }

  const firstAt = email.indexOf("@");
  const lastAt = email.lastIndexOf("@");
  if (firstAt <= 0 || firstAt !== lastAt) {
    return false;
  }

  const localPart = email.slice(0, firstAt);
  const domain = email.slice(firstAt + 1);

  return (
    !/\s/.test(localPart) && domain.toLowerCase() === INTERNAL_DEVELOPER_DOMAIN
  );
};

const isLocalDevelopment = (environment = process.env.NODE_ENV): boolean =>
  environment === undefined ||
  LOCAL_DEVELOPMENT_ENVIRONMENTS.has(environment.toLowerCase());

const logDeveloperActionDenied = (
  event: DeveloperActionDeniedEvent,
  onDenied?: (event: DeveloperActionDeniedEvent) => void
): void => {
  if (onDenied) {
    onDenied(event);
    return;
  }

  console.warn(JSON.stringify(event));
};

/**
 * Authorize a dev-exclusive action against one organization.
 *
 * Every environment requires a workspace session and organization membership.
 * Local development intentionally keeps the existing broad member workflow;
 * production-like environments additionally require a verified,
 * exact-domain FrontDesk email. Call this before resolving integrations,
 * looking up targets, invoking connectors, or enqueueing work.
 */
export const authorizeDeveloperAction = (
  req: AuthorizeReq,
  organizationId: string,
  options: DeveloperActionAuthorizationOptions = {}
): { userId: string; userName: string | null } => {
  const context = req.context ?? {};
  const actorUserId = getWorkspaceUserId(context) ?? null;
  const action = options.action ?? "unknown";

  const deny = (reason: DeveloperActionDenialReason): never => {
    logDeveloperActionDenied(
      {
        action,
        actorUserId,
        event: "developer_action.authorization_denied",
        organizationId,
        reason,
      },
      options.onDenied
    );
    throw new Error("UNAUTHORIZED");
  };

  // Developer actions are for workspace users, not connector keys, public
  // API keys, or portal customer sessions. Keeping this check explicit also
  // prevents an internal bot key from bypassing the production predicate.
  if (
    !actorUserId ||
    context.internalApiKey ||
    context.publicApiKey ||
    getPortalUserId(context) !== undefined
  ) {
    deny("missing_session");
  }

  if (!isLocalDevelopment(options.environment)) {
    if (context.user?.emailVerified !== true) {
      deny("unverified_email");
    }

    if (!isInternalDeveloperEmail(context.user?.email)) {
      deny("non_internal_email");
    }
  }

  try {
    // Use the existing organization authorization path and intentionally omit
    // a role requirement: internal developers do not need owner/admin access.
    authorize(req, {
      allowInternalApiKey: false,
      organizationId,
    });
  } catch {
    deny("not_organization_member");
  }

  return getWorkspaceActor(req);
};

export interface ThreadCreateAuthInput {
  organizationId: string;
  inputUserId?: string;
  hasIntegrationOnlyFields: boolean;
}

export type ThreadCreateAuthFlow =
  | "integration"
  | "public"
  | "portal"
  | "workspace";

export const getPortalUserId = (
  ctx: AuthorizationContext
): string | undefined =>
  ctx.portalSession?.session?.userId ??
  ctx.portalSession?.user?.id ??
  undefined;

export const getWorkspaceUserId = (
  ctx: AuthorizationContext
): string | undefined => ctx.session?.userId ?? undefined;

export const requireInternalApiKey = (
  ctx: AuthorizationContext | null | undefined
): void => {
  if (!ctx?.internalApiKey) {
    throw new Error("UNAUTHORIZED");
  }
};

export const getWorkspaceActor = (
  req: AuthorizeReq
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
  input: { userName?: string } = {}
): { userId: string; userName: string } => {
  const ctx = req.context ?? {};
  const userId = getPortalUserId(ctx);
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
  input: { userName?: string } = {}
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
    userId: actor.userId,
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
  input: ThreadCreateAuthInput
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
    if (ctx.portalOrganizationId !== input.organizationId) {
      throw new Error("UNAUTHORIZED");
    }
    return "portal";
  }

  if (hasWorkspaceSession && !hasInternalKey && !hasPublicKey) {
    authorize(req, { organizationId: input.organizationId });
    return "workspace";
  }

  if (hasPublicKey) {
    authorize(req, {
      allowPublicApiKey: true,
      organizationId: input.organizationId,
    });
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
  }
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

export const authorizeSelfOrInternal = (
  req: AuthorizeReq,
  userId: string
): void => {
  const ctx = req.context ?? {};
  if (ctx.internalApiKey) {
    return;
  }

  if (getWorkspaceUserId(ctx) === userId) {
    return;
  }

  throw new Error("UNAUTHORIZED");
};

export const authorizeWorkspaceOrgMember = (
  req: AuthorizeReq,
  organizationId: string
): { userId: string; userName: string | null } => {
  authorize(req, {
    allowInternalApiKey: false,
    organizationId,
  });

  return getWorkspaceActor(req);
};

export const authorizeOwnedAgentChat = (
  req: AuthorizeReq,
  chat: { organizationId: string; userId: string }
): { userId: string; userName: string | null } => {
  const actor = authorizeWorkspaceOrgMember(req, chat.organizationId);

  if (chat.userId !== actor.userId) {
    throw new Error("UNAUTHORIZED");
  }

  return actor;
};

export const assertInviteRecipient = (
  req: AuthorizeReq,
  inviteEmail: string
): void => {
  const userEmail = req.context?.user?.email;
  if (!userEmail || userEmail.toLowerCase() !== inviteEmail.toLowerCase()) {
    throw new Error("INVALID_USER");
  }

  getWorkspaceActor(req);
};

export const getAuthorizedOrganizationIds = (
  req: AuthorizeReq
): string[] | null => {
  const ctx = req.context ?? {};

  if (ctx.internalApiKey) {
    return null;
  }

  if (ctx.publicApiKey) {
    return [ctx.publicApiKey.ownerId];
  }

  if (!ctx.orgUsers?.length) {
    return [];
  }

  return [...new Set(ctx.orgUsers.map((orgUser) => orgUser.organizationId))];
};

export const isAuthorized = (
  ctx: AuthorizationContext,
  opts: AuthorizeOptions
): boolean => {
  if (opts.internalApiKeyOnly) {
    return !!ctx.internalApiKey;
  }

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
    return (
      !!opts.organizationId && ctx.portalOrganizationId === opts.organizationId
    );
  }

  if (ctx.orgUsers && opts.organizationId) {
    const orgUser = ctx.orgUsers.find(
      (ou) => ou.organizationId === opts.organizationId
    );

    if (!orgUser) {
      return false;
    }

    if (opts.role) {
      const requiredLevel = getRoleLevel(opts.role);
      if (requiredLevel === undefined) {
        return false;
      }
      const userLevel = ROLE_HIERARCHY[orgUser.role] ?? 0;
      return userLevel >= requiredLevel;
    }

    return true;
  }

  return false;
};

export const authorize = (req: AuthorizeReq, opts: AuthorizeOptions): void => {
  if (opts.internalApiKeyOnly) {
    requireInternalApiKey(req.context);
    return;
  }

  if (!opts.organizationId) {
    throw new Error("UNAUTHORIZED");
  }

  if (isAuthorized(req.context ?? {}, opts)) {
    return;
  }

  throw new Error("UNAUTHORIZED");
};

/** Resolve portal tenant slug from forwarded browser origin (subdomain or /support/{slug}). */
export const parsePortalOrganizationSlug = (
  headers: Record<string, string>
): string | undefined => {
  const baseHostname = new URL(
    process.env.BASE_FRONTEND_URL ?? "http://localhost:3000"
  ).hostname.toLowerCase();

  const candidates = [
    headers.origin,
    headers.referer,
    headers["x-forwarded-host"]
      ? `https://${headers["x-forwarded-host"]}`
      : undefined,
    headers.host ? `https://${headers.host}` : undefined,
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const hostname = url.hostname.toLowerCase();
      const isBaseHost = hostname === baseHostname;
      const isBaseSubdomain = hostname.endsWith(`.${baseHostname}`);

      if (!isBaseHost && !isBaseSubdomain) {
        continue;
      }

      if (isBaseHost) {
        const pathMatch = url.pathname.match(/^\/support\/([^/]+)/);
        if (pathMatch?.[1]) {
          return pathMatch[1];
        }
      }

      if (isBaseSubdomain) {
        return hostname.slice(0, -(baseHostname.length + 1));
      }
    } catch {
      continue;
    }
  }

  return undefined;
};
