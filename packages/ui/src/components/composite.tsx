"use client";

import { useRender } from "@base-ui/react/use-render";
import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";

type CompositeOrientation = "vertical" | "horizontal";

type CompositeItemRecord = {
  id: string;
  ref: React.RefObject<HTMLElement | null>;
  disabled: boolean;
};

type CompositeContextValue = {
  items: CompositeItemRecord[];
  activeIndex: number;
  hasFocusedItem: boolean;
  isMouseInside: boolean;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  registerItem: (
    item: Omit<CompositeItemRecord, "ref"> & {
      ref: React.RefObject<HTMLElement | null>;
    },
  ) => void;
  unregisterItem: (id: string) => void;
};

const CompositeContext = React.createContext<CompositeContextValue | null>(
  null,
);

type CompositeProps = React.ComponentProps<"div"> & {
  orientation?: CompositeOrientation;
  loop?: boolean;
  defaultActiveIndex?: number;
};

function Composite({
  className,
  orientation = "vertical",
  loop = true,
  defaultActiveIndex = 0,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  tabIndex,
  ...props
}: CompositeProps) {
  const [items, setItems] = React.useState<CompositeItemRecord[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(defaultActiveIndex);
  const [isMouseInside, setIsMouseInside] = React.useState(false);
  const [hasFocusedItem, setHasFocusedItem] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const handleKeyNavigationRef =
    React.useRef<(event: Pick<KeyboardEvent, "key" | "preventDefault">) => void>(
      () => {},
    );

  const registerItem = React.useCallback((item: CompositeItemRecord) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.id === item.id);

      if (existingIndex === -1) {
        return [...prev, item];
      }

      const next = [...prev];
      next[existingIndex] = item;
      return next;
    });
  }, []);

  const unregisterItem = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  React.useEffect(() => {
    if (items.length === 0) {
      if (activeIndex !== -1) {
        setActiveIndex(-1);
      }
      return;
    }

    const hasActive = activeIndex >= 0 && activeIndex < items.length;
    const isActiveEnabled = hasActive && !items[activeIndex]?.disabled;

    if (isActiveEnabled) {
      return;
    }

    const firstEnabledIndex = items.findIndex((item) => !item.disabled);
    setActiveIndex(firstEnabledIndex);
  }, [items, activeIndex]);

  const focusIndex = React.useCallback(
    (index: number) => {
      const target = items[index];

      if (!target || target.disabled) {
        return;
      }

      setActiveIndex(index);
      target.ref.current?.focus();
    },
    [items],
  );

  const getEnabledIndices = React.useCallback(
    () =>
      items.reduce<number[]>((result, item, index) => {
        if (!item.disabled && item.ref.current) {
          result.push(index);
        }
        return result;
      }, []),
    [items],
  );

  const moveActive = React.useCallback(
    (delta: number) => {
      const enabledIndices = getEnabledIndices();
      if (enabledIndices.length === 0) {
        return;
      }

      const currentEnabledPosition = enabledIndices.indexOf(activeIndex);
      const startPosition =
        currentEnabledPosition === -1
          ? delta > 0
            ? 0
            : enabledIndices.length - 1
          : currentEnabledPosition;

      let nextPosition = startPosition + delta;

      if (loop) {
        nextPosition =
          (nextPosition + enabledIndices.length) % enabledIndices.length;
      } else {
        nextPosition = Math.max(
          0,
          Math.min(enabledIndices.length - 1, nextPosition),
        );
      }

      focusIndex(enabledIndices[nextPosition] ?? -1);
    },
    [activeIndex, focusIndex, getEnabledIndices, loop, items.length],
  );

  const handleKeyNavigation = React.useCallback(
    (event: Pick<KeyboardEvent, "key" | "preventDefault">) => {
      const isVertical = orientation === "vertical";
      const isHorizontal = orientation === "horizontal";

      if (
        (isVertical && event.key === "ArrowDown") ||
        (isHorizontal && event.key === "ArrowRight")
      ) {
        event.preventDefault();
        moveActive(1);
        return;
      }

      if (
        (isVertical && event.key === "ArrowUp") ||
        (isHorizontal && event.key === "ArrowLeft")
      ) {
        event.preventDefault();
        moveActive(-1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        const firstEnabledIndex = getEnabledIndices()[0];
        if (firstEnabledIndex !== undefined) {
          focusIndex(firstEnabledIndex);
        }
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        const enabledIndices = getEnabledIndices();
        const lastEnabledIndex = enabledIndices[enabledIndices.length - 1];
        if (lastEnabledIndex !== undefined) {
          focusIndex(lastEnabledIndex);
        }
      }
    },
    [activeIndex, focusIndex, getEnabledIndices, items.length, moveActive, orientation],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }
      handleKeyNavigation(event);
    },
    [handleKeyNavigation, onKeyDown],
  );

  React.useEffect(() => {
    handleKeyNavigationRef.current = handleKeyNavigation;
  }, [handleKeyNavigation]);

  const handleWindowKeyDown = React.useCallback(
    (event: KeyboardEvent) => {
      if (
        event.target instanceof Node &&
        containerRef.current?.contains(event.target)
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      handleKeyNavigationRef.current(event);
    },
    [],
  );

  const handleMouseEnter = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      onMouseEnter?.(event);
      setIsMouseInside(true);
      window.addEventListener("keydown", handleWindowKeyDown);
    },
    [handleWindowKeyDown, onMouseEnter],
  );

  const handleMouseLeave = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      onMouseLeave?.(event);
      setIsMouseInside(false);
      window.removeEventListener("keydown", handleWindowKeyDown);
    },
    [handleWindowKeyDown, onMouseLeave],
  );

  const handleFocusCapture = React.useCallback(() => {
    setHasFocusedItem(true);
  }, []);

  const handleBlurCapture = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
        return;
      }
      setHasFocusedItem(false);
    },
    [],
  );

  React.useEffect(() => {
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [handleWindowKeyDown]);

  return (
    <CompositeContext.Provider
      value={{
        items,
        activeIndex,
        hasFocusedItem,
        isMouseInside,
        setActiveIndex,
        registerItem,
        unregisterItem,
      }}
    >
      <div
        ref={containerRef}
        data-slot="composite"
        data-orientation={orientation}
        role="listbox"
        aria-orientation={orientation}
        tabIndex={tabIndex ?? 0}
        className={cn(
          "gap-2",
          orientation === "vertical" ? "flex flex-col" : "flex",
          className,
        )}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
        {...props}
      />
    </CompositeContext.Provider>
  );
}

interface CompositeItemProps extends useRender.ComponentProps<"button"> {
  disabled?: boolean;
}

const CompositeItem = React.forwardRef<HTMLElement, CompositeItemProps>(
  (
    { className, render, disabled = false, onClick, onFocus, onMouseMove, ...props },
    forwardedRef,
  ) => {
    const context = React.useContext(CompositeContext);

    if (!context) {
      throw new Error("CompositeItem must be used within Composite.");
    }

    const {
      activeIndex,
      hasFocusedItem,
      isMouseInside,
      items,
      registerItem,
      setActiveIndex,
      unregisterItem,
    } =
      context;
    const localRef = React.useRef<HTMLElement | null>(null);
    const id = React.useId();

    React.useEffect(() => {
      registerItem({
        id,
        disabled,
        ref: localRef,
      });

      return () => {
        unregisterItem(id);
      };
    }, [disabled, id, registerItem, unregisterItem]);

    const itemIndex = React.useMemo(
      () => items.findIndex((item) => item.id === id),
      [items, id],
    );

    const firstEnabledIndex = React.useMemo(
      () => items.findIndex((item) => !item.disabled),
      [items],
    );

    const tabIndex =
      disabled || itemIndex === -1
        ? -1
        : activeIndex === -1
          ? itemIndex === firstEnabledIndex
            ? 0
            : -1
          : itemIndex === activeIndex
            ? 0
            : -1;

    const isActive = itemIndex === activeIndex;
    const shouldShowActiveState = isActive && (isMouseInside || hasFocusedItem);

    const element = useRender({
      defaultTagName: "button",
      render,
      ref: [forwardedRef, localRef],
      props: {
        ...props,
        "data-slot": "composite-item",
        "data-composite-item": "true",
        "data-active": shouldShowActiveState ? "true" : "false",
        "data-disabled": disabled ? "true" : "false",
        role: "option",
        type: "button",
        disabled: disabled || undefined,
        tabIndex,
        "aria-disabled": disabled ? true : undefined,
        "aria-selected": isActive,
        className: cn(
          "inline-flex items-center justify-start rounded-md border px-3 py-2 text-sm outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring/50",
          "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground",
          "data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed",
          className,
        ),
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          if (disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event as React.MouseEvent<HTMLButtonElement>);
        },
        onFocus: (event: React.FocusEvent<HTMLElement>) => {
          onFocus?.(event as React.FocusEvent<HTMLButtonElement>);
          if (disabled || itemIndex === -1) {
            return;
          }
          if (activeIndex !== itemIndex) {
            setActiveIndex(itemIndex);
          }
        },
        onMouseMove: (event: React.MouseEvent<HTMLElement>) => {
          onMouseMove?.(event as React.MouseEvent<HTMLButtonElement>);
          if (disabled || itemIndex === -1) {
            return;
          }
          const activeElement = document.activeElement;
          if (
            activeElement instanceof HTMLElement &&
            activeElement.dataset.compositeItem === "true"
          ) {
            activeElement.blur();
          }
          if (activeIndex !== itemIndex) {
            setActiveIndex(itemIndex);
          }
        },
      },
    });

    return element;
  },
);

CompositeItem.displayName = "CompositeItem";

export { Composite, CompositeItem };
