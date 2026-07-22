import type { JSONContent } from "@tiptap/react";
import type {
  Blockquote,
  Code,
  Heading,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Text,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const mdastTextsToTipTap = (
  node: PhrasingContent,
  marks?: JSONContent["marks"]
): JSONContent => {
  if (node.type === "inlineCode") {
    return {
      marks: [
        {
          type: "code",
        },
      ],
      text: (node as InlineCode).value,
      type: "text",
    };
  }

  if (node.type === "strong") {
    return mdastTextsToTipTap(node.children[0] as PhrasingContent, [
      ...(marks ?? []),
      {
        type: "bold",
      },
    ]);
  }
  if (node.type === "emphasis") {
    return mdastTextsToTipTap(node.children[0] as PhrasingContent, [
      ...(marks ?? []),
      {
        type: "italic",
      },
    ]);
  }
  if (node.type === "delete") {
    return mdastTextsToTipTap(node.children[0] as PhrasingContent, [
      ...(marks ?? []),
      {
        type: "strike",
      },
    ]);
  }

  if (node.type === "link") {
    return mdastTextsToTipTap(node.children[0] as PhrasingContent, [
      {
        attrs: {
          href: (node as Link).url,
        },
        type: "link",
      },
    ]);
  }

  return {
    marks,
    text: (node as Text).value,
    type: "text",
  };
};

const mdastToTipTap = {
  text: mdastTextsToTipTap,
  emphasis: mdastTextsToTipTap,
  strong: mdastTextsToTipTap,
  inlineCode: mdastTextsToTipTap,
  delete: mdastTextsToTipTap,
  link: mdastTextsToTipTap,

  paragraph: (node: Paragraph): JSONContent => ({
    content: node.children.map((child) => convertMdastNode(child)),
    type: "paragraph",
  }),

  heading: (node: Heading): JSONContent => ({
    attrs: {
      level: node.depth,
    },
    content: node.children.map((child) => convertMdastNode(child)),
    type: "heading",
  }),

  blockquote: (node: Blockquote): JSONContent => ({
    content: node.children.map((child) => convertMdastNode(child)),
    type: "blockquote",
  }),

  // TODO parse language
  code: (node: Code): JSONContent => ({
    attrs: {
      language: null,
    },
    type: "codeBlock",
    ...(node.value ? { content: [{ text: node.value, type: "text" }] } : {}),
  }),

  break: (): JSONContent => ({
    type: "paragraph",
  }),

  list: (node: List): JSONContent => ({
    attrs: node.start
      ? {
          start: node.start,
          type: null,
        }
      : {},
    content: node.children.map((child) => convertMdastNode(child)),
    type: node.ordered ? "orderedList" : "bulletList",
  }),

  listItem: (node: ListItem): JSONContent => ({
    content: node.children.map((child) => convertMdastNode(child)),
    type: "listItem",
  }),

  thematicBreak: () => ({
    type: "horizontalRule",
  }),

  definition: () => {
    throw new Error("Function not implemented.");
  },
  footnoteDefinition: () => {
    throw new Error("Function not implemented.");
  },
  footnoteReference: () => {
    throw new Error("Function not implemented.");
  },
  html: () => {
    throw new Error("Function not implemented.");
  },
  image: () => {
    throw new Error("Function not implemented.");
  },
  imageReference: () => {
    throw new Error("Function not implemented.");
  },
  linkReference: () => {
    throw new Error("Function not implemented.");
  },
  table: () => {
    throw new Error("Function not implemented.");
  },
  tableCell: () => {
    throw new Error("Function not implemented.");
  },
  tableRow: () => {
    throw new Error("Function not implemented.");
  },
  yaml: (): JSONContent => {
    throw new Error("Function not implemented.");
  },
  // MDX-specific node types - skip or convert to text
  mdxTextExpression: (): JSONContent => ({
    type: "paragraph",
  }),
  mdxJsxTextElement: (): JSONContent => ({
    type: "paragraph",
  }),
  mdxFlowExpression: (): JSONContent => ({
    type: "paragraph",
  }),
  mdxJsxFlowElement: (): JSONContent => ({
    type: "paragraph",
  }),
  mdxjsEsm: (): JSONContent => ({
    type: "paragraph",
  }),
};

function convertMdastNode(node: RootContent): JSONContent {
  const converter = (
    mdastToTipTap as Record<string, (node: unknown) => JSONContent>
  )[node.type];
  if (!converter) {
    throw new Error("Function not implemented.");
  }
  return converter(node);
}

export const parse = (str: string): JSONContent[] => {
  const doc = unified().use(remarkParse).use(remarkGfm).parse(str);

  return doc.children.flatMap((child) => {
    try {
      return [convertMdastNode(child)];
    } catch {
      return [];
    }
  });
};
