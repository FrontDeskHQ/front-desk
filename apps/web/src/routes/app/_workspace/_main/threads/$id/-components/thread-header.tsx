import type { InferLiveObject } from "@live-state/sync";
import { Avatar } from "@workspace/ui/components/avatar";
import { RichText } from "@workspace/ui/components/blocks/tiptap";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";

type Message = InferLiveObject<typeof schema.message, { author: true }>;

export function ThreadHeader({
  title,
  message,
}: {
  title: string;
  message: Message;
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <TooltipProvider>
        <div className="group flex flex-col gap-3 rounded-md pt-0 py-1">
          <div className="flex items-start gap-3">
            <Avatar variant="user" size="lg" fallback={message.author.name} />
            <div className="flex flex-col gap-0.75">
              <p className="text-sm box-trim-both box-edge-[cap_alphabetic]">
                {message.author.name}
              </p>
              <span className="text-xs text-foreground-secondary box-trim-both">
                {formatRelativeTime(message.createdAt as Date)}
              </span>
            </div>
          </div>
          <div>
            <RichText content={safeParseJSON(message.content)} />
          </div>
        </div>
      </TooltipProvider>
    </>
  );
}
