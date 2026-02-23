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
import { AnimatePresence, motion } from "motion/react";

type ToolbarActionsProps = {
  mode: "reply" | "support-intelligence" | null;
  isResolved: boolean;
  onToggleReply: () => void;
  onToggleSupportIntelligence: () => void;
  onResolve: () => void;
  onNext: () => void;
};

export const ToolbarActions = ({
  mode,
  isResolved,
  onToggleReply,
  onToggleSupportIntelligence,
  onResolve,
  onNext,
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
            className={cn(
              "bg-background-tertiary dark:bg-background-tertiary",
              mode === "support-intelligence" && "dark:bg-input/45",
            )}
            onClick={onToggleSupportIntelligence}
            size="lg"
            tooltip="Chat with Support Intelligence"
            keybind="b"
          >
            <BotMessageSquare />
            Support Intelligence
          </ActionButton>
        </ButtonGroup>
        <div className="flex">
          <AnimatePresence initial={false}>
            {!isResolved && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <ActionButton
                  variant="outline"
                  className="bg-background-tertiary dark:bg-background-tertiary rounded-r-none! border-r-0"
                  size="lg"
                  tooltip="Resolve the thread"
                  keybind="cmd+option+r"
                  onClick={onResolve}
                >
                  <CheckIcon />
                  Resolve
                </ActionButton>
              </motion.div>
            )}
          </AnimatePresence>
          <ActionButton
            variant="outline"
            className={cn(
              "bg-background-tertiary dark:bg-background-tertiary transition-[border-radius] duration-150",
              !isResolved && "rounded-l-none!",
            )}
            size="lg"
            tooltip="Navigate to the next thread"
            keybind="j"
            onClick={onNext}
          >
            <ArrowRightIcon />
            Next
          </ActionButton>
        </div>
      </div>
    </TooltipProvider>
  );
};
