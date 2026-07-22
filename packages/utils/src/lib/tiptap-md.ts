/** biome-ignore-all lint/style/noNonNullAssertion: Too much type work - PRs welcome */
import type { Level } from "@tiptap/extension-heading";
import type { JSONContent } from "@tiptap/react";
import type {
  BlockContent,
  Blockquote,
  Code,
  Heading,
  InlineCode,
  Link,
  List,
  ListItem,
  Node,
  Paragraph,
  PhrasingContent,
  Root,
  Text,
  ThematicBreak,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

const markToMdastType: Record<string, PhrasingContent["type"]> = {
  bold: "strong",
  code: "inlineCode",
  italic: "emphasis",
  link: "link",
  strike: "delete",
};

const markPrecedence: Record<string, number> = {
  bold: 1,
  code: 4,
  italic: 2,
  link: 0,
  strike: 3,
};

const convertTextMarks = (
  marks: JSONContent["marks"],
  text: Text
): PhrasingContent => {
  if (!marks || !marks?.length) {
    return text;
  }

  const sortedMarks = [...(marks ?? [])].sort(
    (a, b) =>
      (markPrecedence[a?.type ?? ""] ?? 99) -
      (markPrecedence[b?.type ?? ""] ?? 99)
  );
  const [mark, ...rest] = sortedMarks;

  const markType = mark?.type;
  if (!markType) {
    return text;
  }

  const type = markToMdastType[markType];

  if (!type) {
    return convertTextMarks(rest, text);
  }

  if (type === "inlineCode") {
    return {
      type,
      value: text.value,
    } satisfies InlineCode;
  }
  if (type === "link") {
    return {
      children: [convertTextMarks(rest, text)],
      type,
      url: (mark.attrs?.href as string | undefined) ?? "",
    } satisfies Link;
  }

  return {
    children: [convertTextMarks(rest, text)],
    type,
  } as PhrasingContent;
};

const tipTapToMdast: Record<
  string,
  (node: JSONContent, ignore?: Record<string, boolean>) => Node
> = {
  blockquote: (node, ignore) =>
    ({
      type: "blockquote",
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as BlockContent[],
    }) satisfies Blockquote,
  bulletList: (node, ignore) =>
    ({
      type: "list",
      ordered: false,
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as ListItem[],
    }) satisfies List,
  codeBlock: (node) =>
    ({
      type: "code",
      value: node.content?.[0]?.text ?? "",
    }) satisfies Code,
  heading: (node, ignore) =>
    ({
      type: "heading",
      depth: Math.max(1, Math.min(4, node.attrs?.level ?? 1)) as Level,
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as PhrasingContent[],
    }) satisfies Heading,
  horizontalRule: () =>
    ({
      type: "thematicBreak",
    }) satisfies ThematicBreak,
  listItem: (node, ignore) =>
    ({
      type: "listItem",
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as BlockContent[],
    }) satisfies ListItem,
  orderedList: (node, ignore) =>
    ({
      type: "list",
      ordered: true,
      start: node.attrs?.start,
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as ListItem[],
    }) satisfies List,
  paragraph: (node, ignore) =>
    ({
      type: "paragraph",
      children: (node.content?.flatMap((child) => {
        const result = ignoreOrTiptapToMdast(child, ignore);
        return result ? [result] : [];
      }) ?? []) as PhrasingContent[],
    }) satisfies Paragraph,
  text: (node) => {
    if (!node.text) {
      return {
        type: "text",
        value: "",
      } satisfies Text;
    }

    return convertTextMarks(node.marks, {
      type: "text",
      value: node.text,
    } satisfies Text);
  },
};

const ignoreOrTiptapToMdast = (
  node: JSONContent,
  ignore?: Record<string, boolean>
) => {
  const nodeType = node.type;
  if (!nodeType) {
    return undefined;
  }

  const tipTapToMdastNode = tipTapToMdast[nodeType]?.(node, ignore);
  if (ignore?.[nodeType]) {
    return tipTapToMdast.paragraph?.(node, ignore);
  }
  return tipTapToMdastNode;
};

export const stringify = (
  doc: JSONContent[] | JSONContent | string,
  ignore?: Record<string, boolean>
) => {
  const content: JSONContent[] = Array.isArray(doc)
    ? doc
    : typeof doc === "string"
      ? [{ type: "paragraph", content: [{ type: "text", text: doc }] }]
      : [doc];

  const mdast = content.flatMap((node) => {
    const mdastNode = ignoreOrTiptapToMdast(node, ignore);
    if (!mdastNode) {
      return [];
    }
    return [mdastNode];
  });

  return unified()
    .use(remarkStringify)
    .use(remarkGfm)
    .stringify({ children: mdast, type: "root" } as Root);
};
