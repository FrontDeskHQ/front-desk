import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";

import type { schema } from "../live-state/schema";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

const storedEnvelopeSchema = z.object({
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
});

export interface IntegrationCredentialKeyring {
  currentKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

const decodeKey = (encoded: string): Buffer => {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("INTEGRATION_CREDENTIAL_KEY_MUST_BE_32_BYTES");
  }
  return key;
};

export const readIntegrationCredentialKeyring = (
  env: NodeJS.ProcessEnv = process.env
): IntegrationCredentialKeyring => {
  const currentKeyId = env.INTEGRATION_CREDENTIAL_CURRENT_KEY_ID?.trim();
  const encodedKeys = env.INTEGRATION_CREDENTIAL_KEYS;
  if (!(currentKeyId && encodedKeys)) {
    throw new Error("INTEGRATION_CREDENTIAL_KEYRING_REQUIRED");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(encodedKeys);
  } catch {
    throw new Error("INTEGRATION_CREDENTIAL_KEYRING_INVALID");
  }
  const parsed = z.record(z.string().min(1), z.string().min(1)).safeParse(raw);
  if (!parsed.success || !(currentKeyId in parsed.data)) {
    throw new Error("INTEGRATION_CREDENTIAL_KEYRING_INVALID");
  }

  return {
    currentKeyId,
    keys: new Map(
      Object.entries(parsed.data).map(([keyId, encoded]) => [
        keyId,
        decodeKey(encoded),
      ])
    ),
  };
};

const aad = (organizationId: string, integrationId: string): Buffer =>
  Buffer.from(`${organizationId}:${integrationId}`, "utf-8");

export const encryptIntegrationCredential = (
  value: unknown,
  scope: { integrationId: string; organizationId: string },
  keyring: IntegrationCredentialKeyring
): { encryptedPayload: string; keyId: string } => {
  const key = keyring.keys.get(keyring.currentKeyId);
  if (!key) {
    throw new Error("INTEGRATION_CREDENTIAL_CURRENT_KEY_MISSING");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad(scope.organizationId, scope.integrationId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf-8"),
    cipher.final(),
  ]);

  return {
    encryptedPayload: JSON.stringify({
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
    }),
    keyId: keyring.currentKeyId,
  };
};

export const decryptIntegrationCredential = <T>(
  encryptedPayload: string,
  keyId: string,
  scope: { integrationId: string; organizationId: string },
  keyring: IntegrationCredentialKeyring
): T => {
  const key = keyring.keys.get(keyId);
  if (!key) {
    throw new Error("INTEGRATION_CREDENTIAL_KEY_NOT_FOUND");
  }
  const envelope = storedEnvelopeSchema.parse(JSON.parse(encryptedPayload));
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAAD(aad(scope.organizationId, scope.integrationId));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf-8");
  return JSON.parse(plaintext) as T;
};

type CredentialDB = Pick<
  ServerDB<typeof schema>,
  "integration" | "integrationCredential" | "transaction"
>;

const requireOwnedIntegration = async (
  db: CredentialDB,
  organizationId: string,
  integrationId: string
) => {
  const integration = await db.integration.one(integrationId).get();
  if (!integration || integration.organizationId !== organizationId) {
    throw new Error("INTEGRATION_NOT_FOUND");
  }
};

const lockOwnedIntegration = async (
  db: CredentialDB,
  organizationId: string,
  integrationId: string
): Promise<void> => {
  const integration = await db.integration.one(integrationId).get();
  if (!integration || integration.organizationId !== organizationId) {
    throw new Error("INTEGRATION_NOT_FOUND");
  }

  // Credential rows do not exist until the first write, so use their owning
  // integration as the stable mutex. This update takes a row-level write lock
  // for the transaction and makes writes, rotations, and clears serialize.
  await db.integration.update(integrationId, { updatedAt: new Date() });
};

export const writeIntegrationCredential = async (
  db: CredentialDB,
  input: {
    integrationId: string;
    organizationId: string;
    value: unknown;
  },
  keyring: IntegrationCredentialKeyring = readIntegrationCredentialKeyring()
): Promise<void> => {
  const encrypted = encryptIntegrationCredential(input.value, input, keyring);
  await db.transaction(async ({ trx }) => {
    await lockOwnedIntegration(trx, input.organizationId, input.integrationId);
    const existing = (
      await trx.integrationCredential
        .where({ integrationId: input.integrationId })
        .get()
    )[0];
    const now = new Date();

    if (existing) {
      await trx.integrationCredential.update(existing.id, {
        ...encrypted,
        revokedAt: null,
        updatedAt: now,
        version: existing.version + 1,
      });
      return;
    }

    await trx.integrationCredential.insert({
      ...encrypted,
      createdAt: now,
      id: ulid().toLowerCase(),
      integrationId: input.integrationId,
      organizationId: input.organizationId,
      revokedAt: null,
      updatedAt: now,
      version: 1,
    });
  });
};

export const readIntegrationCredential = async <T>(
  db: CredentialDB,
  input: { integrationId: string; organizationId: string },
  keyring: IntegrationCredentialKeyring = readIntegrationCredentialKeyring()
): Promise<T | null> => {
  await requireOwnedIntegration(db, input.organizationId, input.integrationId);
  const row = (
    await db.integrationCredential
      .where({
        integrationId: input.integrationId,
        organizationId: input.organizationId,
      })
      .get()
  )[0];
  if (!row?.encryptedPayload || row.revokedAt) {
    return null;
  }
  return decryptIntegrationCredential<T>(
    row.encryptedPayload,
    row.keyId,
    input,
    keyring
  );
};

export const clearIntegrationCredential = async (
  db: CredentialDB,
  input: { integrationId: string; organizationId: string }
): Promise<void> => {
  await db.transaction(async ({ trx }) => {
    await lockOwnedIntegration(trx, input.organizationId, input.integrationId);
    const row = (
      await trx.integrationCredential
        .where({
          integrationId: input.integrationId,
          organizationId: input.organizationId,
        })
        .get()
    )[0];
    if (!row) {
      return;
    }
    const now = new Date();
    await trx.integrationCredential.update(row.id, {
      encryptedPayload: null,
      revokedAt: now,
      updatedAt: now,
      version: row.version + 1,
    });
  });
};
