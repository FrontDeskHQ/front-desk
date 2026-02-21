import { ActionButton } from "@workspace/ui/components/button";
import { ButtonGroup } from "@workspace/ui/components/button-group";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRightIcon,
  BotMessageSquare,
  CheckIcon,
  ReplyIcon,
} from "lucide-react";

type ToolbarActionsProps = {
  mode: "reply" | "support-intelligence" | null;
  onToggleReply: () => void;
};

export const ToolbarActions = ({
  mode,
  onToggleReply,
}: ToolbarActionsProps) => {
  return (
    <TooltipProvider>
      <div data-slot="toolbar-actions" className="flex gap-2.5 mx-auto">
        <ButtonGroup>
          <ActionButton
            variant="outline"
            className={cn(
              "bg-background-tertiary dark:bg-background-tertiary",
              mode === "reply" && "dark:bg-input/45",
            )}
            onClick={onToggleReply}
            size="lg"
            tooltip="Start a new reply"
            keybind="r"
          >
            <ReplyIcon />
            Reply
          </ActionButton>
          <ActionButton
            variant="outline"
            className="bg-background-tertiary dark:bg-background-tertiary"
            size="lg"
            tooltip="Chat with Support Intelligence"
            keybind="b"
          >
            <BotMessageSquare />
            Support Intelligence
          </ActionButton>
        </ButtonGroup>
        <ButtonGroup>
          <ActionButton
            variant="outline"
            className="bg-background-tertiary dark:bg-background-tertiary"
            size="lg"
            tooltip="Resolve the thread"
            keybind="cmd+option+r"
          >
            <CheckIcon />
            Resolve
          </ActionButton>
          <ActionButton
            variant="outline"
            className="bg-background-tertiary dark:bg-background-tertiary"
            size="lg"
            tooltip="Navigate to the next thread"
            keybind="j"
          >
            <ArrowRightIcon />
            Next
          </ActionButton>
        </ButtonGroup>
      </div>
    </TooltipProvider>
  );
};
