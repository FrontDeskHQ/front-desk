import DefaultHeading from "@tiptap/extension-heading";
import { Extension } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/react";
import { StarterKit as DefaultStarterKit } from "@tiptap/starter-kit";

import { LinkExtension } from "../components/blocks/tiptap-link";

export const StarterKit = DefaultStarterKit.configure({
  heading: false,
  trailingNode: false,
  // Replaced by LinkExtension below, which renders links through a host-app
  // provided renderer (thread chips, GitHub PR chips, …).
  link: false,
});

export const EditorExtensions = [
  StarterKit,
  DefaultHeading.configure({ levels: [1, 2, 3, 4] }),
  LinkExtension,
];

export const KeyBinds = Extension.create<{
  keybinds: Record<string, (props: { editor: Editor }) => boolean>;
}>({
  addKeyboardShortcuts() {
    return this.options.keybinds;
  },

  addOptions() {
    return {
      keybinds: {},
    };
  },

  name: "textAlign",
});

/** @deprecated Use getFirstTextContent from @workspace/utils instead */
export function getFirstTextContent(
  content: JSONContent[] | JSONContent | string
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const first = content[0];
    if (!first) {
      return "";
    }

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

/** @deprecated Use safeParseJSON from @workspace/utils instead */
export const safeParseJSON = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return (parsed as { content: JSONContent[] }).content ?? [];
    }
  } catch {}

  return [
    {
      content: [{ type: "text", text: String(raw) }],
      type: "paragraph",
    },
  ];
};
