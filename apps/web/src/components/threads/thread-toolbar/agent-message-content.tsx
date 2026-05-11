import { RichMarkdown } from "~/components/markdown/rich-markdown";

export function AgentMessageContent({ content }: { content: string }) {
  return <RichMarkdown content={content} preset="default" />;
}
