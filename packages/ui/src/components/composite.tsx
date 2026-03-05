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
  itemCount: number;
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
  itemCount?: number;
  scrollElement?: React.RefObject<HTMLElement | null>;
};

function Composite({
  className,
  orientation = "vertical",
  loop = false,
  defaultActiveIndex = 0,
  itemCount,
  scrollElement,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  tabIndex,
  ...props
}: CompositeProps) {
  const [items, setItems] = React.useState<CompositeItemRecord[]>([]);
  const [activeIndex, setActiveIndexRaw] = React.useState(defaultActiveIndex);
  const [isMouseInside, setIsMouseInside] = React.useState(false);
  const [hasFocusedItem, setHasFocusedItem] = React.useState(false);

  const setActiveIndex: React.Dispatch<React.SetStateAction<number>> =
    React.useCallback(
      (value) => {
        setActiveIndexRaw(value);
      },
      [],
    );

  const resolvedItemCount = itemCount ?? items.length;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const handleKeyNavigationRef = React.useRef<
    (event: Pick<KeyboardEvent, "key" | "preventDefault">) => void
  >(() => {});

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
    if (resolvedItemCount === 0) {
      if (activeIndex !== -1) {
        setActiveIndex(-1);
      }
      return;
    }

    const hasActive = activeIndex >= 0 && activeIndex < resolvedItemCount;
    if (hasActive) {
      const mountedItem = items.find(
        (item) => item.id === String(activeIndex),
      );
      if (!mountedItem || !mountedItem.disabled) {
        return;
      }
    }

    const firstEnabled = items.find((item) => !item.disabled);
    setActiveIndex(firstEnabled ? Number(firstEnabled.id) || 0 : 0);
  }, [items, activeIndex, resolvedItemCount]);

  const scrollItemIntoView = React.useCallback(
    (index: number) => {
      const el = scrollElement?.current;
      if (!el) return;

      const item = items.find((i) => i.id === String(index));
      const target = item?.ref.current;
      if (!target) return;

      const container = el.getBoundingClientRect();
      const rect = target.getBoundingClientRect();

      if (rect.top < container.top) {
        el.scrollBy({ top: rect.top - container.top });
      } else if (rect.bottom > container.bottom) {
        el.scrollBy({ top: rect.bottom - container.bottom });
      }
    },
    [items, scrollElement],
  );

  const focusIndex = React.useCallback(
    (index: number, delta?: number) => {
      if (index < 0 || index >= resolvedItemCount) {
        return;
      }

      setActiveIndex(index);
      const target = items.find((item) => item.id === String(index));
      target?.ref.current?.focus();

      if (scrollElement?.current && delta) {
        const peekIndex = Math.max(
          0,
          Math.min(resolvedItemCount - 1, index + delta),
        );
        scrollItemIntoView(peekIndex);
      }
    },
    [items, resolvedItemCount, setActiveIndex, scrollElement, scrollItemIntoView],
  );

  const moveActive = React.useCallback(
    (delta: number) => {
      if (resolvedItemCount === 0) {
        return;
      }

      let nextIndex = activeIndex + delta;

      if (loop) {
        nextIndex =
          (nextIndex + resolvedItemCount) % resolvedItemCount;
      } else {
        nextIndex = Math.max(0, Math.min(resolvedItemCount - 1, nextIndex));
      }

      if (nextIndex === activeIndex && !loop) {
        return;
      }

      focusIndex(nextIndex, delta);
    },
    [activeIndex, focusIndex, loop, resolvedItemCount],
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
        focusIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusIndex(resolvedItemCount - 1);
      }
    },
    [focusIndex, moveActive, orientation, resolvedItemCount],
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

  const handleWindowKeyDown = React.useCallback((event: KeyboardEvent) => {
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
  }, []);

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
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
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
        itemCount: resolvedItemCount,
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
  itemId?: string;
}

const CompositeItem = React.forwardRef<HTMLElement, CompositeItemProps>(
  (
    {
      className,
      render,
      disabled = false,
      itemId,
      onClick,
      onFocus,
      onMouseMove,
      ...props
    },
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
      itemCount,
      items,
      registerItem,
      setActiveIndex,
      unregisterItem,
    } = context;
    const localRef = React.useRef<HTMLElement | null>(null);
    const autoId = React.useId();
    const id = itemId ?? autoId;

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
      () => (itemId != null ? Number(itemId) : items.findIndex((item) => item.id === id)),
      [items, id, itemId],
    );

    const tabIndex =
      disabled || itemIndex === -1
        ? -1
        : activeIndex === -1
          ? itemIndex === 0
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
          "outline-none transition-colors",
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
