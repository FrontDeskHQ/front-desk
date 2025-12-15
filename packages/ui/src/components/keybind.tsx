import { forwardRef, useMemo } from "react";

const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPad/.test(navigator.platform);

export const Keybind = ({ keybind }: { keybind: string }) => {
  const keys = keybind.split("-");

  const isMac = isMacPlatform();

  const replacements = useMemo<Record<string, string>>(
    () => ({
      mod: isMac ? "⌘" : "ctrl",
      shift: "⇧",
      alt: isMac ? "⌥" : "alt",
      cmd: isMac ? "⌘" : "ctrl",
      option: isMac ? "⌥" : "alt",
      ctrl: "ctrl",
    }),
    [isMac],
  );

  return (
    <div className="flex items-center gap-0.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="text-xs border-muted-foreground/20 text-muted-foreground rounded-xs h-5 min-w-5 px-1 flex items-center justify-center border font-family"
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
    // biome-ignore lint/a11y/noStaticElementInteractions: this div is intentionally used to capture and stop keydown event propagation
    <div ref={ref} className={className} onKeyDown={handleKeyDown} {...props}>
      {children}
    </div>
  );
});

KeybindIsolation.displayName = "KeybindIsolation";
