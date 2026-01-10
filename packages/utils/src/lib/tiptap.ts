import type { JSONContent } from "@tiptap/react";

/**
 * Converts JSONContent to plain text, extracting all text content
 * while preserving formatting like line breaks and paragraphs.
 *
 * @param content - The JSONContent to convert (can be an array, single object, or string)
 * @returns The plain text representation of the content
 */
export function jsonContentToPlainText(
  content: JSONContent[] | JSONContent | string
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item: JSONContent) => jsonContentToPlainText(item))
      .filter((text: string) => text.length > 0)
      .join("\n");
  }

  if (content && typeof content === "object") {
    // Handle hard breaks
    if (content.type === "hardBreak") {
      return "\n";
    }

    // If it's a text node, return the text
    if (content.type === "text" && content.text) {
      return content.text;
    }

    // If it has content, recursively process it
    if (content.content && Array.isArray(content.content)) {
      const text = content.content
        .map((item: JSONContent) => jsonContentToPlainText(item))
        .filter((text: string) => text.length > 0)
        .join("");

      // Add line breaks for block-level nodes
      if (
        content.type === "paragraph" ||
        content.type === "heading" ||
        content.type === "blockquote" ||
        content.type === "codeBlock"
      ) {
        return text ? `${text}\n` : "\n";
      }

      // Add line breaks for list items
      if (content.type === "listItem") {
        return text ? `- ${text}\n` : "";
      }

      // For inline nodes (bold, italic, etc.), just return the text without formatting
      return text;
    }
  }

  return "";
}

export const safeParseJSON = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return (parsed as { content: JSONContent[] }).content ?? [];
    }
  } catch {}

  return [
    {
      type: "paragraph",
      content: [{ type: "text", text: String(raw) }],
    },
  ];
};

export function getFirstTextContent(
  content: JSONContent[] | JSONContent | string
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const first = content[0];
    if (!first) return "";

    const text = getFirstTextContent(first);

    if (text) {
      return text + (content.length > 1 ? "..." : "");
    }

    return "";
  }

  if (content && typeof content === "object") {
    if (content.type === "text" && content.text) {
      return content.text;
    }
    if (content.content && Array.isArray(content.content)) {
      return getFirstTextContent(content.content);
    }
  }

  return "";
}
