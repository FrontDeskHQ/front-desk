import type { z } from "zod";

/**
 * Build a schema-bound integration-settings parser. Each connector has its own
 * settings schema (discord/slack), so the schema is injected once and the
 * returned `safeParseIntegrationSettings` keeps the connector's call sites
 * argument-compatible with the old per-connector helper.
 */
export const createSettingsParser = <S extends z.ZodTypeAny>(schema: S) => {
  const safeParseIntegrationSettings = (
    configStr: string | null
  ): z.infer<S> | undefined => {
    if (!configStr) {
      return undefined;
    }
    try {
      return schema.parse(JSON.parse(configStr));
    } catch {
      return undefined;
    }
  };

  return { safeParseIntegrationSettings };
};

/**
 * Parse a Tiptap message body from its stored JSON string into the `content[]`
 * array our editor produces, tolerating the common shapes and falling back to a
 * single plain-text paragraph.
 */
export const safeParseJSON = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    // Accept common shapes produced by our editor:
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      // e.g. a full doc { type: 'doc', content: [...] }
      // Normalize to content[] to match our usage.
      return (parsed as { content?: unknown }).content ?? [];
    }
  } catch {}
  // Fallback: wrap plain text in a single paragraph node.
  return [
    {
      content: [{ type: "text", text: String(raw) }],
      type: "paragraph",
    },
  ];
};
