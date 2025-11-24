import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { Check, Copy } from "lucide-react";
import { useEffect, useId, useState } from "react";

interface CopyButtonProps {
  value: string;
  ariaLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}

const CopyButton = ({
  value,
  ariaLabel = "Copy to clipboard",
  variant = "outline",
  size = "icon",
  className,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => {
        setCopied(false);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleCopy = async () => {
    if (value) {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
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
        ></TooltipTrigger>
        <TooltipContent>{copied ? "Copied" : ariaLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface CopyInputProps {
  value: string;
  label?: string;
  inputClassName?: string;
  buttonAriaLabel?: string;
  readOnly?: boolean;
}

const CopyInputRoot = ({
  value,
  label,
  inputClassName,
  buttonAriaLabel = "Copy to clipboard",
  readOnly = true,
}: CopyInputProps) => {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-2">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          readOnly={readOnly}
          value={value}
          className={inputClassName}
        />
        <CopyButton value={value} ariaLabel={buttonAriaLabel} />
      </div>
    </div>
  );
};

export const CopyInput = Object.assign(CopyInputRoot, {
  Button: CopyButton,
});
