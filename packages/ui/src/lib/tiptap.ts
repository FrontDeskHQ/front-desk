import DefaultHeading from "@tiptap/extension-heading";
import {
  type Editor,
  Extension,
  type JSONContent,
  mergeAttributes,
} from "@tiptap/react";
import { StarterKit as DefaultStarterKit } from "@tiptap/starter-kit";

export const StarterKit = DefaultStarterKit.configure({
  paragraph: {
    HTMLAttributes: {
      class: "leading-relaxed [&:not(:first-child)]:mt-2",
    },
  },
  bulletList: {
    HTMLAttributes: {
      class: "list-disc my-2 ml-6",
    },
  },
  listItem: {
    HTMLAttributes: {
      class: "mt-1.5",
    },
  },
  orderedList: {
    HTMLAttributes: {
      class: "list-decimal my-2 ml-6",
    },
  },
  bold: {
    HTMLAttributes: {
      class: "font-semibold",
    },
  },
  blockquote: {
    HTMLAttributes: {
      class:
        "relative mt-2 pl-4 before:w-[2.5px] before:bg-muted-foreground/40 before:absolute before:left-0 before:top-0 before:h-full before:rounded-full",
    },
  },
  code: {
    HTMLAttributes: {
      class:
        "bg-muted relative px-[0.3rem] py-[0.2rem] font-mono font-light rounded-sm",
    },
  },
  codeBlock: {
    HTMLAttributes: {
      class: "bg-muted relative p-2 font-mono font-light rounded-sm mt-2",
    },
  },
  link: {
    HTMLAttributes: {
      class: "text-primary border-b border-primary cursor-pointer",
    },
  },
  horizontalRule: {
    HTMLAttributes: {
      class: "mt-2 mb-2 border-t border-muted-foreground/15",
    },
  },
  heading: false,
  trailingNode: false,
});

export const EditorExtensions = [
  StarterKit,
  DefaultHeading.extend({
    renderHTML({ node, HTMLAttributes }) {
      const level = this.options.levels.includes(node.attrs.level)
        ? node.attrs.level
        : this.options.levels[0];

      const classes: { [index: number]: string } = {
        1: "text-xl font-semibold border-b border-muted-foreground/15 not-first:mt-12 mb-4",
        2: "text-xl font-semibold not-first:mt-8 mb-4",
        3: "text-lg font-semibold not-first:mt-6 mb-2",
        4: "font-semibold not-first:mt-4 mb-2",
      };

      return [
        `h${level}`,
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          class: `${classes[level]}`,
        }),
        0,
      ];
    },
  }).configure({ levels: [1, 2, 3, 4] }),
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
      return (parsed as any).content ?? [];
    }
  } catch {}

  return [
    {
      type: "paragraph",
      content: [{ type: "text", text: String(raw) }],
    },
  ];
};
