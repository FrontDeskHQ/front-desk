import { hkdfSync } from "node:crypto";

import { widgetIdentitySettingsSchema } from "@workspace/schemas/organization";
import { jwtVerify } from "jose";

import { schema } from "../live-state/schema";
import { storage } from "../live-state/storage";

export const WIDGET_TOKEN_AUDIENCE = "frontdesk-widget";
export const WIDGET_TOKEN_ISSUER = "frontdesk";
export const WIDGET_TOKEN_CLOCK_SKEW_SECONDS = 60;
export const WIDGET_TOKEN_MAX_TTL_SECONDS = 15 * 60;

const MASTER_KEY_ENVIRONMENT_VARIABLE = "FRONTDESK_WIDGET_SIGNING_MASTER_KEY";

export interface WidgetIdentity {
  organizationId: string;
  userId: string;
  name: string;
  email?: string;
}

export interface VerifyWidgetTokenOptions {
  organizationId: string;
  secrets: readonly string[];
  now?: () => number;
}

export interface WidgetIdentitySettings {
  allowedOrigins: string[];
  currentKeyVersion: number;
  previousKeyVersion: number | null;
}

/** JWT-looking bearer values must not fall through to private-key auth. */
export const isWidgetToken = (value: string): boolean =>
  value.split(".").length === 3;

export const readWidgetIdentitySettings = (
  settings: unknown
): WidgetIdentitySettings => {
  const settingsRecord =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : undefined;

  if (!settingsRecord || !Object.hasOwn(settingsRecord, "widgetIdentity")) {
    return widgetIdentitySettingsSchema.parse({});
  }

  const parsed = widgetIdentitySettingsSchema.safeParse(
    settingsRecord.widgetIdentity
  );

  if (parsed.success) {
    return parsed.data;
  }

  throw new Error("INVALID_WIDGET_IDENTITY_SETTINGS");
};

export const deriveWidgetSigningSecret = (input: {
  masterKey: string;
  organizationId: string;
  version: number;
}): string => {
  if (!input.masterKey.trim()) {
    throw new Error("WIDGET_SIGNING_MASTER_KEY_REQUIRED");
  }
  if (!input.organizationId.trim()) {
    throw new Error("WIDGET_ORGANIZATION_ID_REQUIRED");
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("WIDGET_SIGNING_KEY_VERSION_INVALID");
  }

  const derived = hkdfSync(
    "sha256",
    Buffer.from(input.masterKey),
    Buffer.from("frontdesk-widget-signing-v1"),
    Buffer.from(
      `organization:${input.organizationId}:version:${input.version}`
    ),
    32
  );

  return `fd_wsk_${Buffer.from(derived).toString("base64url")}`;
};

export const getWidgetSigningSecrets = (input: {
  organizationId: string;
  settings?: unknown;
  masterKey?: string;
}): string[] => {
  const masterKey =
    input.masterKey ?? process.env[MASTER_KEY_ENVIRONMENT_VARIABLE];
  if (!masterKey?.trim()) {
    return [];
  }

  const settings = readWidgetIdentitySettings(input.settings);
  const versions = [
    settings.currentKeyVersion,
    settings.previousKeyVersion,
  ].filter((version): version is number => version !== null);

  return [...new Set(versions)].map((version) =>
    deriveWidgetSigningSecret({
      masterKey,
      organizationId: input.organizationId,
      version,
    })
  );
};

export const isWidgetOriginAllowed = (
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean => {
  if (allowedOrigins.length === 0) {
    return true;
  }

  if (!origin) {
    return false;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.some(
    (allowedOrigin) => normalizeOrigin(allowedOrigin) === normalizedOrigin
  );
};

/**
 * Verify a widget assertion with an explicit secret set. Keeping this pure
 * makes the security contract easy to test without a database.
 */
export const verifyWidgetToken = async (
  token: string,
  options: VerifyWidgetTokenOptions
): Promise<WidgetIdentity> => {
  if (!isWidgetToken(token) || options.secrets.length === 0) {
    throw new Error("INVALID_WIDGET_TOKEN");
  }

  const now = options.now ?? (() => Date.now());
  const nowSeconds = Math.floor(now() / 1000);

  for (const secret of options.secrets) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
        {
          algorithms: ["HS256"],
          audience: WIDGET_TOKEN_AUDIENCE,
          clockTolerance: WIDGET_TOKEN_CLOCK_SKEW_SECONDS,
          currentDate: new Date(nowSeconds * 1000),
          issuer: WIDGET_TOKEN_ISSUER,
        }
      );

      const userId = readRequiredClaim(payload.sub);
      const name = readRequiredClaim(payload.name);
      const exp = readIntegerClaim(payload.exp);
      const iat =
        payload.iat === undefined ? undefined : readIntegerClaim(payload.iat);

      if (payload.iat !== undefined && iat === undefined) {
        throw new Error("INVALID_WIDGET_TOKEN");
      }

      if (
        exp === undefined ||
        exp <= nowSeconds - WIDGET_TOKEN_CLOCK_SKEW_SECONDS
      ) {
        throw new Error("INVALID_WIDGET_TOKEN");
      }
      if (iat !== undefined) {
        if (iat > nowSeconds + WIDGET_TOKEN_CLOCK_SKEW_SECONDS) {
          throw new Error("INVALID_WIDGET_TOKEN");
        }
        if (exp - iat > WIDGET_TOKEN_MAX_TTL_SECONDS) {
          throw new Error("INVALID_WIDGET_TOKEN");
        }
      }
      if (
        exp >
        nowSeconds +
          WIDGET_TOKEN_MAX_TTL_SECONDS +
          WIDGET_TOKEN_CLOCK_SKEW_SECONDS
      ) {
        throw new Error("INVALID_WIDGET_TOKEN");
      }

      const tokenOrganizationIds = [payload.org, payload.organizationId].filter(
        (value) => value !== undefined
      );
      const tokenOrganizationId = tokenOrganizationIds[0];
      if (
        tokenOrganizationIds.length === 0 ||
        typeof tokenOrganizationId !== "string" ||
        tokenOrganizationIds.some(
          (value) =>
            typeof value !== "string" || value !== options.organizationId
        )
      ) {
        throw new Error("WIDGET_ORGANIZATION_MISMATCH");
      }

      const email = payload.email;
      if (email !== undefined && typeof email !== "string") {
        throw new Error("INVALID_WIDGET_TOKEN");
      }

      return {
        ...(email === undefined ? {} : { email }),
        name,
        organizationId: tokenOrganizationId,
        userId,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "WIDGET_ORGANIZATION_MISMATCH"
      ) {
        throw error;
      }
      // Try the previous live signing key before failing the assertion.
    }
  }

  throw new Error("INVALID_WIDGET_TOKEN");
};

/** Resolve and verify the assertion for the organization named by its public key. */
export const resolveWidgetIdentity = async (input: {
  token: string;
  organizationId: string;
  origin?: string;
}): Promise<WidgetIdentity> => {
  const organizations = Object.values(
    await storage.find(schema.organization, {
      where: { id: input.organizationId },
    })
  );
  const organization = organizations[0];
  if (!organization) {
    throw new Error("INVALID_WIDGET_TOKEN");
  }

  const settings = readWidgetIdentitySettings(organization.settings);
  if (!isWidgetOriginAllowed(input.origin, settings.allowedOrigins)) {
    throw new Error("WIDGET_ORIGIN_NOT_ALLOWED");
  }

  const secrets = getWidgetSigningSecrets({
    organizationId: input.organizationId,
    settings: organization.settings,
  });
  return verifyWidgetToken(input.token, {
    organizationId: input.organizationId,
    secrets,
  });
};

const normalizeOrigin = (origin: string): string => {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.trim().replace(/\/+$/u, "");
  }
};

const readRequiredClaim = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("INVALID_WIDGET_TOKEN");
  }
  return value;
};

const readIntegerClaim = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value;
};
