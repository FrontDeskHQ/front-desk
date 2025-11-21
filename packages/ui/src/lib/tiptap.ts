import DefaultHeading from "@tiptap/extension-heading";
import {
  type Editor,
  Extension,
  type JSONContent,
} from "@tiptap/react";
import { StarterKit as DefaultStarterKit } from "@tiptap/starter-kit";

export const StarterKit = DefaultStarterKit.configure({
  heading: false,
  trailingNode: false,
});

export const EditorExtensions = [
  StarterKit,
  DefaultHeading.configure({ levels: [1, 2, 3, 4] }),
];

export const KeyBinds = Extension.create<{
  keybinds: Record<string, (props: { editor: Editor }) => boolean>;
}>({
  name: "textAlign",

  addOptions() {
    return {
      keybinds: {},
    };
  },

  addKeyboardShortcuts() {
    return this.options.keybinds;
  },
});

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
