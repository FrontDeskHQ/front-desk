import { cn } from "@workspace/ui/lib/utils";
import { forwardRef, useMemo } from "react";

const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPad/.test(navigator.platform);

export const Keybind = ({
  keybind,
  className,
}: {
  keybind: string;
  className?: string;
}) => {
  const keys = keybind.split(/[-+]/);

  const isMac = isMacPlatform();

  const replacements = useMemo<Record<string, string>>(
    () => ({
      alt: isMac ? "⌥" : "alt",
      backspace: "⌫",
      cmd: isMac ? "⌘" : "ctrl",
      ctrl: "ctrl",
      delete: "⌦",
      enter: "↵",
      escape: "esc",
      mod: isMac ? "⌘" : "ctrl",
      option: isMac ? "⌥" : "alt",
      shift: "⇧",
      space: "␣",
      tab: "⇥",
    }),
    [isMac]
  );

  return (
    <div className="flex items-center gap-0.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className={cn(
            "text-xs border-muted-foreground/20 text-muted-foreground rounded-xs h-5 min-w-5 px-1 flex items-center justify-center border font-family",
            className
          )}
        >
          {replacements[key] || key.toUpperCase()}
        </kbd>
      ))}
    </div>
  );
};

type KeybindIsolationProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * Component that isolates keybinds by stopping keydown event propagation.
 * Useful for wrapping inputs and other elements where you want to prevent
 * global keybinds from triggering.
 *
 * @example
 * ```tsx
 * <KeybindIsolation>
 *   <input type="text" />
 * </KeybindIsolation>
 * ```
 */
export const KeybindIsolation = forwardRef<
  HTMLDivElement,
  KeybindIsolationProps
>(({ children, className, onKeyDown, ...props }, ref) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onKeyDown?.(event);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- stops keydown propagation for nested inputs
    <div ref={ref} className={className} onKeyDown={handleKeyDown} {...props}>
      {children}
    </div>
  );
});

KeybindIsolation.displayName = "KeybindIsolation";
