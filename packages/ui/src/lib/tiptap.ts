import DefaultHeading from "@tiptap/extension-heading";
import {
  type Editor,
  Extension,
  type JSONContent,
  mergeAttributes,
} from "@tiptap/react";
import { StarterKit as DefaultStarterKit } from "@tiptap/starter-kit";

/**
 * Shared typography styles configuration
 */
export const typographyStyles = {
  paragraph: "leading-relaxed [&:not(:first-child)]:mt-2",
  bulletList: "list-disc my-2 ml-6",
  listItem: "mt-1.5",
  orderedList: "list-decimal my-2 ml-6",
  bold: "font-semibold",
  blockquote:
    "relative mt-2 pl-4 before:w-[2.5px] before:bg-muted-foreground/40 before:absolute before:left-0 before:top-0 before:h-full before:rounded-full",
  code: "bg-muted relative px-[0.3rem] py-[0.2rem] font-mono font-light rounded-sm",
  codeBlock: "bg-muted relative p-2 font-mono font-light rounded-sm mt-2",
  link: "text-primary border-b border-primary cursor-pointer",
  horizontalRule: "mt-2 mb-2 border-t border-muted-foreground/15",
  heading: {
    1: "text-xl font-semibold border-b border-muted-foreground/15 not-first:mt-12 mb-4",
    2: "text-xl font-semibold not-first:mt-8 mb-4",
    3: "text-lg font-semibold not-first:mt-6 mb-2",
    4: "font-semibold not-first:mt-4 mb-2",
  },
} as const;

/**
 * Helper function to convert TipTap class strings to Prose element selectors.
 * Splits space-separated classes and prefixes each with the element selector.
 */
function toProseClasses(selector: string, classes: string): string[] {
  return classes.split(" ").map((cls) => `[&_${selector}]:${cls}`);
}

/**
 * Converts typography styles to Prose component class names.
 * Each style is prefixed with the appropriate HTML element selector.
 */
export function getProseStyles(): string[] {
  return [
    // Paragraphs
    ...toProseClasses("p", typographyStyles.paragraph),
    // Lists
    ...toProseClasses("ul", typographyStyles.bulletList),
    ...toProseClasses("ol", typographyStyles.orderedList),
    ...toProseClasses("li", typographyStyles.listItem),
    // Bold text
    ...toProseClasses("strong", typographyStyles.bold),
    ...toProseClasses("b", typographyStyles.bold),
    // Blockquotes
    ...toProseClasses("blockquote", typographyStyles.blockquote),
    // Inline code
    ...toProseClasses("code", typographyStyles.code),
    // Code blocks
    ...toProseClasses("pre", typographyStyles.codeBlock),
    // Links
    ...toProseClasses("a", typographyStyles.link),
    // Horizontal rules
    ...toProseClasses("hr", typographyStyles.horizontalRule),
    // Headings
    ...toProseClasses("h1", typographyStyles.heading[1]),
    ...toProseClasses("h2", typographyStyles.heading[2]),
    ...toProseClasses("h3", typographyStyles.heading[3]),
    ...toProseClasses("h4", typographyStyles.heading[4]),
  ];
}

export const StarterKit = DefaultStarterKit.configure({
  paragraph: {
    HTMLAttributes: {
      class: typographyStyles.paragraph,
    },
  },
  bulletList: {
    HTMLAttributes: {
      class: typographyStyles.bulletList,
    },
  },
  listItem: {
    HTMLAttributes: {
      class: typographyStyles.listItem,
    },
  },
  orderedList: {
    HTMLAttributes: {
      class: typographyStyles.orderedList,
    },
  },
  bold: {
    HTMLAttributes: {
      class: typographyStyles.bold,
    },
  },
  blockquote: {
    HTMLAttributes: {
      class: typographyStyles.blockquote,
    },
  },
  code: {
    HTMLAttributes: {
      class: typographyStyles.code,
    },
  },
  codeBlock: {
    HTMLAttributes: {
      class: typographyStyles.codeBlock,
    },
  },
  link: {
    HTMLAttributes: {
      class: typographyStyles.link,
    },
  },
  horizontalRule: {
    HTMLAttributes: {
      class: typographyStyles.horizontalRule,
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

      return [
        `h${level}`,
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          class:
            typographyStyles.heading[
              level as keyof typeof typographyStyles.heading
            ],
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
