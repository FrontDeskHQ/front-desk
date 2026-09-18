import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { Check, Copy } from "lucide-react";
import { useEffect, useId, useState } from "react";

const COPY_FEEDBACK_MS = 2000;

export const COPY_INPUT_ACTION_BUTTON_CLASSNAME =
  "hover:bg-accent/20 active:bg-accent/30 dark:hover:bg-white/5 dark:active:bg-white/7";

export const COPY_INPUT_ACTION_POSITION_CLASSNAME =
  "pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1";

interface CopyButtonProps {
  value: string;
  ariaLabel?: string;
  tooltip?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}

const CopyButton = ({
  value,
  ariaLabel = "Copy to clipboard",
  tooltip = "Copy",
  variant = "ghost",
  size = "icon",
  className,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => {
      setCopied(false);
      setTooltipOpen(false);
    }, COPY_FEEDBACK_MS);

    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTooltipOpen(true);
  };

  const handleTooltipOpenChange = (open: boolean) => {
    if (copied) {
      return;
    }

    setTooltipOpen(open);
  };

  return (
    <TooltipProvider>
      <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <TooltipTrigger
          render={() => (
            <Button
              variant={variant}
              size={size}
              onClick={handleCopy}
              aria-label={ariaLabel}
              className={className}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          )}
        />
        <TooltipContent>{copied ? "Copied" : tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface CopyInputProps {
  value: string;
  label?: string;
  inputClassName?: string;
  buttonAriaLabel?: string;
  buttonTooltip?: string;
  readOnly?: boolean;
}

const CopyInputRoot = ({
  value,
  label,
  inputClassName,
  buttonAriaLabel = "Copy to clipboard",
  buttonTooltip = "Copy",
  readOnly = true,
}: CopyInputProps) => {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-2">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="relative">
        <Input
          id={inputId}
          readOnly={readOnly}
          value={value}
          className={cn("pe-10", inputClassName)}
        />
        <div className={COPY_INPUT_ACTION_POSITION_CLASSNAME}>
          <div className="pointer-events-auto">
            <CopyButton
              value={value}
              ariaLabel={buttonAriaLabel}
              tooltip={buttonTooltip}
              variant="ghost"
              className={COPY_INPUT_ACTION_BUTTON_CLASSNAME}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const CopyInput = Object.assign(CopyInputRoot, {
  Button: CopyButton,
});
