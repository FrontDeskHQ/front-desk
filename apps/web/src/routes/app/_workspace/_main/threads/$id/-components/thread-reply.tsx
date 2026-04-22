import type { InferLiveObject } from "@live-state/sync";
import { Avatar } from "@workspace/ui/components/avatar";
import { RichText } from "@workspace/ui/components/blocks/tiptap";
import { ActionButton } from "@workspace/ui/components/button";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { mutate } from "~/lib/live-state";

type Message = InferLiveObject<typeof schema.message, { author: true }>;

export function ThreadReply({
  message,
  canMarkAsAnswer,
  highlight,
}: {
  message: Message;
  canMarkAsAnswer: boolean;
  highlight: boolean;
}) {
  const isAnswer = message.markedAsAnswer;

  return (
    <div
      id={isAnswer ? "answer-message" : undefined}
      data-highlight={isAnswer && highlight}
      className={cn(
        "group relative flex items-start gap-2.5 rounded-md p-2 transition-[box-shadow,background-color] duration-200 hover:duration-0 hover:bg-background-tertiary/75 data-[highlight=true]:ring-ring/50 data-[highlight=true]:ring-[3px]",
      )}
    >
      <Avatar variant="user" size="lg" fallback={message.author.name} />
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm box-trim-both">{message.author.name}</p>
          <p className="text-xs text-foreground-secondary box-trim-both">
            {formatRelativeTime(message.createdAt as Date)}
          </p>
        </div>
        <RichText content={safeParseJSON(message.content)} />
      </div>
      {canMarkAsAnswer && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-hover:duration-0 transition-opacity duration-180 rounded-md border h-6.5">
          <TooltipProvider>
            <ActionButton
              variant="ghost"
              size="icon-sm"
              tooltip="Mark as answer"
              onClick={() => {
                mutate.message
                  .markAsAnswer({ messageId: message.id })
                  .catch(() => {
                    toast.error("Failed to mark message as answer");
                  });
              }}
            >
              <Check />
            </ActionButton>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
