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
  italic: "emphasis",
  strike: "delete",
  code: "inlineCode",
  link: "link",
};

const markPrecedence: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  code: 4,
};

const convertTextMarks = (
  marks: JSONContent["marks"],
  text: Text
): PhrasingContent => {
  if (!marks || !marks?.length) {
    return text;
  }

  const [mark, ...rest] = [...marks].sort(
    (a, b) =>
      (markPrecedence[a?.type ?? ""] ?? 99) -
      (markPrecedence[b?.type ?? ""] ?? 99)
  );

  const type = markToMdastType[mark!.type];

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
      type,
      url: mark!.attrs?.href as string,
      children: [convertTextMarks(rest, text)],
    } satisfies Link;
  }

  return {
    type,
    children: [convertTextMarks(rest, text)],
  } as PhrasingContent;
};

const tipTapToMdast: Record<
  string,
  (node: JSONContent, ignore?: Record<string, boolean>) => Node
> = {
  paragraph: (node, ignore) =>
    ({
      type: "paragraph",
      children: (node.content?.flatMap((child) => {
        const result = ignoreOrTiptapToMdast(child, ignore);
        return result ? [result] : [];
      }) ?? []) as PhrasingContent[],
    } satisfies Paragraph),
  text: (node, ignore) =>
    convertTextMarks(node.marks, {
      type: "text",
      value: node.text!,
    } satisfies Text),
  heading: (node, ignore) =>
    ({
      type: "heading",
      depth: Math.max(1, Math.min(4, node.attrs?.level ?? 1)) as Level,
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as PhrasingContent[],
    } satisfies Heading),
  blockquote: (node, ignore) =>
    ({
      type: "blockquote",
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as BlockContent[],
    } satisfies Blockquote),
  codeBlock: (node, ignore) =>
    ({
      type: "code",
      value: node.content?.[0]?.text ?? "",
    } satisfies Code),
  listItem: (node, ignore) =>
    ({
      type: "listItem",
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as BlockContent[],
    } satisfies ListItem),
  bulletList: (node, ignore) =>
    ({
      type: "list",
      ordered: false,
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as ListItem[],
    } satisfies List),
  orderedList: (node, ignore) =>
    ({
      type: "list",
      ordered: true,
      start: node.attrs?.start,
      children: (node.content?.map((child) =>
        ignoreOrTiptapToMdast(child, ignore)
      ) ?? []) as ListItem[],
    } satisfies List),

  horizontalRule: () =>
    ({
      type: "thematicBreak",
    } satisfies ThematicBreak),
};

const ignoreOrTiptapToMdast = (
  node: JSONContent,
  ignore?: Record<string, boolean>
) => {
  const tipTapToMdastNode = tipTapToMdast[node.type!]?.(node, ignore);
  if (ignore?.[node.type!]) {
    return tipTapToMdast["paragraph"]?.(node, ignore);
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
    .stringify({ type: "root", children: mdast } as Root);
};
