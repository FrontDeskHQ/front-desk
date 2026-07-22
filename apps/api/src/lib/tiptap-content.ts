/** Serialize plain text or TipTap JSON (object or JSON string) for message storage. */
export const serializeMessageContent = (content: string | unknown): string => {
  if (content !== null && typeof content === "object") {
    const serialized = JSON.stringify(content);
    return serialized ?? JSON.stringify([{ type: "paragraph" }]);
  }

  if (typeof content !== "string") {
    return JSON.stringify([
      {
        content: [{ type: "text", text: String(content) }],
        type: "paragraph",
      },
    ]);
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
      content: [{ type: "text", text: content }],
      type: "paragraph",
    },
  ]);
};
