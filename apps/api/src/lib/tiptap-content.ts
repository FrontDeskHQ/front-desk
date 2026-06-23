/** Serialize plain text or TipTap JSON (object or JSON string) for message storage. */
export const serializeMessageContent = (content: string | unknown): string => {
  if (typeof content !== "string") {
    const serialized = JSON.stringify(content);
    return serialized ?? JSON.stringify([{ type: "paragraph" }]);
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // fall through to plain-text paragraph
    }
  }

  return JSON.stringify([
    {
      type: "paragraph",
      content: [{ type: "text", text: content }],
    },
  ]);
};
