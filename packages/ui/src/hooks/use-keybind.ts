import isHotkey from "is-hotkey";
import { useEffect, useRef } from "react";

type KeybindEntry = {
  id: number;
  hotkey: string;
  callback: (event: KeyboardEvent) => void;
};

const keybindRegistry: KeybindEntry[] = [];
let nextId = 0;

const handleGlobalKeyDown = (event: KeyboardEvent) => {
  const matchingKeybinds = keybindRegistry.filter((entry) =>
    isHotkey(entry.hotkey, event)
  );

  if (matchingKeybinds.length === 0) {
    return;
  }

  const lastRegistered = matchingKeybinds.reduce((prev, current) =>
    current.id > prev.id ? current : prev
  );

  lastRegistered.callback(event);
};

let isListenerInitialized = false;

const initializeGlobalListener = () => {
  if (isListenerInitialized) {
    return;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleGlobalKeyDown);
    isListenerInitialized = true;
  }
};

type UseKeybindOptions = {
  enabled?: boolean;
};

/**
 * Hook to register a keyboard shortcut that can overlap with others.
 * The last registered keybind wins when multiple keybinds match the same hotkey.
 *
 * @param hotkey - The hotkey string (e.g., "mod+s", "ctrl+k")
 * @param callback - The function to call when the hotkey is pressed
 * @param deps - Dependency array (similar to useEffect). The keybind will be re-registered when deps change.
 * @param options - Options object with `enabled` property (defaults to `true`)
 *
 * @example
 * ```tsx
 * useKeybind("mod+s", () => {
 *   console.log("Save!");
 * }, []);
 *
 * useKeybind("mod+s", () => {
 *   console.log("This will override the previous one");
 * }, [someState]);
 *
 * useKeybind("mod+s", () => {
 *   console.log("Only enabled when condition is true");
 * }, [condition], { enabled: condition });
 * ```
 */
export const useKeybind = (
  hotkey: string,
  callback: (event: KeyboardEvent) => void,
  deps: React.DependencyList = [],
  options: UseKeybindOptions = {}
) => {
  const { enabled = true } = options;
  const idRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    initializeGlobalListener();

    const id = nextId++;
    idRef.current = id;

    const entry: KeybindEntry = {
      id,
      hotkey,
      callback: (event) => {
        callbackRef.current(event);
      },
    };

    keybindRegistry.push(entry);

    return () => {
      const index = keybindRegistry.findIndex((e) => e.id === id);
      if (index !== -1) {
        keybindRegistry.splice(index, 1);
      }
      idRef.current = null;
    };
  }, [hotkey, enabled, ...deps]);
};
