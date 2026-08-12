import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { z } from "zod";

const profileSchema = z.object({
  apiUrl: z.string().url(),
  key: z.string().min(1),
});

const configSchema = z.object({
  profiles: z.record(z.string(), profileSchema),
});

export interface Profile {
  name: string;
  apiUrl: string;
  key: string;
}

export const configPath = (): string =>
  process.env.FD_CONFIG_PATH ??
  path.join(homedir(), ".config", "fd", "config.json");

/**
 * Resolve the active profile. The profile carries the environment's API origin
 * and its private API key together, so switching environments can never leave a
 * key pointed at the wrong host.
 */
export const loadProfile = (requested?: string): Profile => {
  const configFile = configPath();

  let raw: string;
  try {
    raw = readFileSync(configFile, "utf-8");
  } catch {
    throw new Error(
      `No fd config at ${configFile}. Create one with a profile:\n` +
        `{ "profiles": { "local": { "apiUrl": "http://localhost:3333/api/ls", "key": "fd_sk_..." } } }`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${configFile}`, { cause: error });
  }

  const config = configSchema.safeParse(parsed);
  if (!config.success) {
    throw new Error(
      `Invalid fd config at ${configFile}: ${config.error.message}`
    );
  }

  const name = requested ?? process.env.FD_PROFILE ?? "local";
  const profile = config.data.profiles[name];
  if (!profile) {
    const available = Object.keys(config.data.profiles).sort().join(", ");
    throw new Error(
      `Unknown profile "${name}" in ${configFile}. Available: ${available || "(none)"}`
    );
  }

  return { apiUrl: profile.apiUrl, key: profile.key, name };
};
