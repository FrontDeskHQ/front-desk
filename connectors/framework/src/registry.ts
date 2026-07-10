import type { Capability } from "./capabilities";
import { CAPABILITY_INVOKE_PATH } from "./invoke";
import {
  type ConnectorManifest,
  manifests as defaultManifests,
} from "./manifest";

/** A manifest with its resolved host location. */
export interface RegistryEntry {
  manifest: ConnectorManifest;
  baseUrl: string;
  /** Fully-resolved URL to POST invoke envelopes to. */
  invokeUrl: string;
}

export interface ConnectorRegistry {
  /** Look up the connector registered for an integration `type`. */
  getByType(type: string): RegistryEntry | undefined;
  /** Connectors that provide a given capability. */
  providersOf(capability: Capability): RegistryEntry[];
  /**
   * Whether any of the org's enabled integration `types` provides `capability`.
   * Answers "can we offer this?" — a specific invoked call still routes by a
   * concrete target/integration.
   */
  hasCapability(
    enabledTypes: Iterable<string>,
    capability: Capability,
  ): boolean;
}

/**
 * Build the registry from connector manifests. Resolves each manifest's host
 * location from `env` (falling back to its dev default) once, at boot.
 */
export function buildRegistry(
  manifests: ConnectorManifest[] = defaultManifests,
  env: Record<string, string | undefined> = process.env,
): ConnectorRegistry {
  const entries = new Map<string, RegistryEntry>();

  for (const manifest of manifests) {
    const baseUrl = env[manifest.baseUrlEnv] ?? manifest.defaultBaseUrl;
    entries.set(manifest.type, {
      manifest,
      baseUrl,
      invokeUrl: `${baseUrl}${CAPABILITY_INVOKE_PATH}`,
    });
  }

  const providersOf = (capability: Capability): RegistryEntry[] =>
    [...entries.values()].filter((entry) =>
      entry.manifest.capabilities.includes(capability),
    );

  return {
    getByType: (type) => entries.get(type),
    providersOf,
    hasCapability: (enabledTypes, capability) => {
      const providerTypes = new Set(
        providersOf(capability).map((entry) => entry.manifest.type),
      );
      for (const type of enabledTypes) {
        if (providerTypes.has(type)) return true;
      }
      return false;
    },
  };
}
