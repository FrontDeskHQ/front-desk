/** biome-ignore-all lint/suspicious/noExplicitAny: Too much type work - PRs welcome */
/** biome-ignore-all lint/style/noNonNullAssertion: Too much type work - PRs welcome */
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
  RootContentMap,
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
      type: "text",
      text: (node as InlineCode).value,
      marks: [
        {
          type: "code",
        },
      ],
    };
  }

  if (node.type === "strong") {
    return mdastTextsToTipTap(node.children[0] as any, [
      ...(marks ?? []),
      {
        type: "bold",
      },
    ]);
  }
  if (node.type === "emphasis") {
    return mdastTextsToTipTap(node.children[0] as any, [
      ...(marks ?? []),
      {
        type: "italic",
      },
    ]);
  }
  if (node.type === "delete") {
    return mdastTextsToTipTap(node.children[0] as any, [
      ...(marks ?? []),
      {
        type: "strike",
      },
    ]);
  }

  if (node.type === "link") {
    return mdastTextsToTipTap(node.children[0] as any, [
      {
        type: "link",
        attrs: {
          href: (node as Link).url,
        },
      },
    ]);
  }

  return {
    type: "text",
    marks,
    text: (node as Text).value,
  };
};

const mdastToTipTap: {
  [key in RootContent["type"]]: (node: RootContentMap[key]) => JSONContent;
} & Record<string, (node: any) => JSONContent> = {
  text: mdastTextsToTipTap,
  emphasis: mdastTextsToTipTap,
  strong: mdastTextsToTipTap,
  inlineCode: mdastTextsToTipTap,
  delete: mdastTextsToTipTap,
  link: mdastTextsToTipTap,

  paragraph: (node: Paragraph): JSONContent => ({
    type: "paragraph",
    content: node.children.map((child) =>
      mdastToTipTap[child.type](child as any)
    ),
  }),

  heading: (node: Heading): JSONContent => ({
    type: "heading",
    attrs: {
      level: node.depth,
    },
    content: node.children.map((child) =>
      mdastToTipTap[child.type](child as any)
    ),
  }),

  blockquote: (node: Blockquote): JSONContent => ({
    type: "blockquote",
    content: node.children.map((child) =>
      mdastToTipTap[child.type](child as any)
    ),
  }),

  // TODO parse language
  code: (node: Code): JSONContent => ({
    type: "codeBlock",
    attrs: {
      language: null,
    },
    ...(node.value ? { content: [{ type: "text", text: node.value }] } : {}),
  }),

  break: (): JSONContent => ({
    type: "paragraph",
  }),

  list: (node: List): JSONContent => ({
    type: node.ordered ? "orderedList" : "bulletList",
    attrs: node.start
      ? {
          start: node.start,
          type: null,
        }
      : {},
    content: node.children.map((child) =>
      mdastToTipTap[child.type](child as any)
    ),
  }),

  listItem: (node: ListItem): JSONContent => ({
    type: "listItem",
    content: node.children.map((child) =>
      mdastToTipTap[child.type](child as any)
    ),
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

export const parse = (str: string): JSONContent[] => {
  const doc = unified().use(remarkParse).use(remarkGfm).parse(str);

  return doc.children.flatMap((child) => {
    try {
      return [mdastToTipTap[child.type](child as any)];
    } catch {
      return [];
    }
  });
};
