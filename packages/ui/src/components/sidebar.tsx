"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Slot } from "@radix-ui/react-slot";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogPortal,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { cn } from "@workspace/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import * as React from "react";

const SIDEBAR_STORAGE_PREFIX = "fd.sidebar.v1.";
const DEFAULT_WIDTH = 256;
const DEFAULT_MIN_WIDTH = 196;
const DEFAULT_MAX_WIDTH = 480;
const PEEK_CLOSE_DELAY_MS = 400;
const RESIZE_CLICK_THRESHOLD_PX = 4;

type SidebarSide = "left" | "right";
type SidebarCollapseMode = "offcanvas" | "hover" | "none";
type SidebarVariant = "sidebar" | "floating" | "inset";
type LegacyCollapsible = "offcanvas" | "icon" | "none";

interface SidebarPersistedState {
  open: boolean;
  width: number;
}

interface SidebarSnapshot extends SidebarPersistedState {
  peeking: boolean;
  resizing: boolean;
}

interface CreateSidebarHandleOptions {
  id?: string;
  defaultOpen?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapseMode?: SidebarCollapseMode;
}

interface SidebarHandle {
  readonly id: string | undefined;
  readonly panelId: string;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly defaultWidth: number;
  readonly collapseMode: SidebarCollapseMode | undefined;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SidebarSnapshot;
  getServerSnapshot: () => SidebarSnapshot;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setWidth: (width: number | ((prev: number) => number)) => void;
  setPeeking: (peeking: boolean) => void;
  setResizing: (resizing: boolean) => void;
  toggle: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mapLegacyCollapsible(
  collapsible?: LegacyCollapsible
): SidebarCollapseMode | undefined {
  if (collapsible === "icon") {
    return "hover";
  }
  return collapsible;
}

function readPersisted(id: string | undefined): Partial<SidebarPersistedState> {
  if (!id || typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(`${SIDEBAR_STORAGE_PREFIX}${id}`);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<SidebarPersistedState>;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : undefined,
      width: typeof parsed.width === "number" ? parsed.width : undefined,
    };
  } catch {
    return {};
  }
}

function writePersisted(id: string | undefined, snapshot: SidebarPersistedState) {
  if (!id) {
    return;
  }
  try {
    window.localStorage.setItem(
      `${SIDEBAR_STORAGE_PREFIX}${id}`,
      JSON.stringify({ open: snapshot.open, width: snapshot.width })
    );
  } catch {
    // Quota, private mode, or disabled storage.
  }
}

let handleSeq = 0;

function createSidebarHandle(
  options: CreateSidebarHandleOptions = {}
): SidebarHandle {
  const minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const defaultWidth = clamp(
    options.defaultWidth ?? DEFAULT_WIDTH,
    minWidth,
    maxWidth
  );
  const persisted = readPersisted(options.id);
  const initial: SidebarSnapshot = {
    open: persisted.open ?? options.defaultOpen ?? true,
    peeking: false,
    resizing: false,
    width: clamp(persisted.width ?? defaultWidth, minWidth, maxWidth),
  };
  const serverSnapshot: SidebarSnapshot = {
    open: options.defaultOpen ?? true,
    peeking: false,
    resizing: false,
    width: defaultWidth,
  };

  let snapshot = initial;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const persist = () => {
    writePersisted(options.id, { open: snapshot.open, width: snapshot.width });
  };

  const handle: SidebarHandle = {
    collapseMode: options.collapseMode,
    defaultWidth,
    getServerSnapshot: () => serverSnapshot,
    getSnapshot: () => snapshot,
    id: options.id,
    maxWidth,
    minWidth,
    panelId: `sidebar-${options.id ?? ++handleSeq}`,
    setOpen: (open) => {
      const next = typeof open === "function" ? open(snapshot.open) : open;
      if (snapshot.open === next && !snapshot.peeking) {
        return;
      }
      snapshot = { ...snapshot, open: next, peeking: false };
      persist();
      emit();
    },
    setPeeking: (peeking) => {
      if (snapshot.peeking === peeking || snapshot.open) {
        return;
      }
      snapshot = { ...snapshot, peeking };
      emit();
    },
    setResizing: (resizing) => {
      if (snapshot.resizing === resizing) {
        return;
      }
      snapshot = { ...snapshot, resizing };
      emit();
    },
    setWidth: (width) => {
      const next = clamp(
        typeof width === "function" ? width(snapshot.width) : width,
        minWidth,
        maxWidth
      );
      if (snapshot.width === next) {
        return;
      }
      snapshot = { ...snapshot, width: next };
      persist();
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggle: () => {
      handle.setOpen((open) => !open);
    },
  };

  return handle;
}

interface SidebarContextValue {
  collapseMode: SidebarCollapseMode | undefined;
  handle: SidebarHandle;
  isMobile: boolean;
  maxWidth: number;
  minWidth: number;
  onOpenChange?: (open: boolean) => void;
  onWidthChange?: (width: number) => void;
  open: boolean;
  openMobile: boolean;
  overlayRoot: HTMLElement | null;
  peeking: boolean;
  resizing: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setOpenMobile: (open: boolean | ((prev: boolean) => boolean)) => void;
  setPeeking: (peeking: boolean) => void;
  setResizing: (resizing: boolean) => void;
  setWidth: (width: number | ((prev: number) => number)) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
  width: number;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

interface SidebarLayoutContextValue {
  collapseMode: SidebarCollapseMode;
  panelId: string;
  side: SidebarSide;
  variant: SidebarVariant;
}

const SidebarLayoutContext =
  React.createContext<SidebarLayoutContextValue | null>(null);

function useOptionalSidebar() {
  return React.use(SidebarContext);
}

const EMPTY_SNAPSHOT: SidebarSnapshot = {
  open: true,
  peeking: false,
  resizing: false,
  width: DEFAULT_WIDTH,
};

function subscribeNoop() {
  return () => {};
}

function getEmptySnapshot() {
  return EMPTY_SNAPSHOT;
}

function useSidebar(handle?: SidebarHandle): SidebarContextValue {
  const context = useOptionalSidebar();
  const isMobileFallback = useIsMobile();
  const store = handle ?? context?.handle;
  const snapshot = React.useSyncExternalStore(
    store ? store.subscribe : subscribeNoop,
    store ? store.getSnapshot : getEmptySnapshot,
    store ? store.getServerSnapshot : getEmptySnapshot
  );

  if (!store) {
    throw new Error(
      "useSidebar must be used within a SidebarProvider or given a handle."
    );
  }

  if (handle && context?.handle !== handle) {
    return bindHandle(store, snapshot, context?.isMobile ?? isMobileFallback);
  }

  if (!context) {
    return bindHandle(store, snapshot, isMobileFallback);
  }

  return context;
}

function bindHandle(
  handle: SidebarHandle,
  snapshot: SidebarSnapshot,
  isMobile: boolean
): SidebarContextValue {
  const setOpen = handle.setOpen;
  return {
    collapseMode: handle.collapseMode,
    handle,
    isMobile,
    maxWidth: handle.maxWidth,
    minWidth: handle.minWidth,
    open: snapshot.open,
    openMobile: isMobile ? snapshot.open : false,
    overlayRoot: null,
    peeking: snapshot.peeking,
    resizing: snapshot.resizing,
    setOpen,
    setOpenMobile: setOpen,
    setPeeking: handle.setPeeking,
    setResizing: handle.setResizing,
    setWidth: handle.setWidth,
    state: snapshot.open ? "expanded" : "collapsed",
    toggleSidebar: handle.toggle,
    width: snapshot.width,
  };
}

function SidebarProvider({
  children,
  className,
  collapseMode,
  defaultOpen = true,
  defaultWidth,
  handle: handleProp,
  id,
  maxWidth,
  minWidth,
  onOpenChange,
  onWidthChange,
  open: openProp,
  style,
  width: widthProp,
  ...props
}: React.ComponentProps<"div"> & {
  collapseMode?: SidebarCollapseMode;
  defaultOpen?: boolean;
  defaultWidth?: number;
  handle?: SidebarHandle;
  id?: string;
  maxWidth?: number;
  minWidth?: number;
  onOpenChange?: (open: boolean) => void;
  onWidthChange?: (width: number) => void;
  open?: boolean;
  width?: number;
}) {
  const isMobile = useIsMobile();
  const [internalHandle] = React.useState(() =>
    handleProp ??
    createSidebarHandle({
      collapseMode,
      defaultOpen,
      defaultWidth,
      id,
      maxWidth,
      minWidth,
    })
  );
  const handle = handleProp ?? internalHandle;
  const snapshot = React.useSyncExternalStore(
    handle.subscribe,
    handle.getSnapshot,
    handle.getServerSnapshot
  );

  React.useEffect(() => {
    if (openProp !== undefined && openProp !== snapshot.open) {
      handle.setOpen(openProp);
    }
  }, [handle, openProp, snapshot.open]);

  React.useEffect(() => {
    if (widthProp !== undefined && widthProp !== snapshot.width) {
      handle.setWidth(widthProp);
    }
  }, [handle, snapshot.width, widthProp]);

  const setOpen = React.useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(handle.getSnapshot().open) : value;
      onOpenChange?.(next);
      if (openProp === undefined) {
        handle.setOpen(next);
      }
    },
    [handle, onOpenChange, openProp]
  );

  const setWidth = React.useCallback(
    (value: number | ((prev: number) => number)) => {
      const current = handle.getSnapshot().width;
      const next = clamp(
        typeof value === "function" ? value(current) : value,
        handle.minWidth,
        handle.maxWidth
      );
      onWidthChange?.(next);
      if (widthProp === undefined) {
        handle.setWidth(next);
      }
    },
    [handle, onWidthChange, widthProp]
  );

  const toggleSidebar = React.useCallback(() => {
    setOpen((open) => !open);
  }, [setOpen]);

  const [overlayRoot, setOverlayRoot] = React.useState<HTMLElement | null>(
    null
  );

  const contextValue = React.useMemo<SidebarContextValue>(
    () => ({
      collapseMode: collapseMode ?? handle.collapseMode,
      handle,
      isMobile,
      maxWidth: handle.maxWidth,
      minWidth: handle.minWidth,
      onOpenChange,
      onWidthChange,
      open: snapshot.open,
      openMobile: isMobile ? snapshot.open : false,
      overlayRoot,
      peeking: snapshot.peeking,
      resizing: snapshot.resizing,
      setOpen,
      setOpenMobile: setOpen,
      setPeeking: handle.setPeeking,
      setResizing: handle.setResizing,
      setWidth,
      state: snapshot.open ? "expanded" : "collapsed",
      toggleSidebar,
      width: snapshot.width,
    }),
    [
      collapseMode,
      handle,
      isMobile,
      onOpenChange,
      onWidthChange,
      overlayRoot,
      setOpen,
      setWidth,
      snapshot.open,
      snapshot.peeking,
      snapshot.resizing,
      snapshot.width,
      toggleSidebar,
    ]
  );

  return (
    <SidebarContext value={contextValue}>
      <TooltipProvider>
        <div
          ref={setOverlayRoot}
          data-slot="sidebar-wrapper"
          data-state={contextValue.state}
          style={
            {
              "--sidebar-width": `${snapshot.width}px`,
              "--sidebar-width-icon": "3rem",
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper relative flex min-h-0 w-full grow shrink",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext>
  );
}

const sidebarVariants = cva(
  "text-sidebar-foreground flex h-full w-full flex-col",
  {
    compoundVariants: [
      { class: "border-r", side: "left", variant: "inset" },
      { class: "border-l", side: "right", variant: "inset" },
    ],
    defaultVariants: {
      side: "left",
      variant: "sidebar",
    },
    variants: {
      side: {
        left: "",
        right: "",
      },
      variant: {
        floating: "rounded-lg border bg-sidebar shadow-sm",
        inset: "bg-sidebar",
        sidebar: "bg-transparent",
      },
    },
  }
);

function resolveCollapseMode({
  collapseMode,
  collapsible,
  fromContext,
  side,
}: {
  collapseMode?: SidebarCollapseMode;
  collapsible?: LegacyCollapsible;
  fromContext?: SidebarCollapseMode;
  side: SidebarSide;
}): SidebarCollapseMode {
  return (
    collapseMode ??
    mapLegacyCollapsible(collapsible) ??
    fromContext ??
    (side === "left" ? "hover" : "offcanvas")
  );
}

function usePeekHover({
  enabled,
  resizing,
  setPeeking,
}: {
  enabled: boolean;
  resizing: boolean;
  setPeeking: (peeking: boolean) => void;
}) {
  const closeTimerRef = React.useRef<number | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current == null) {
      return;
    }
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const onPeekEnter = React.useCallback(() => {
    if (!enabled) {
      return;
    }
    cancelClose();
    setPeeking(true);
  }, [cancelClose, enabled, setPeeking]);

  const onPeekLeave = React.useCallback(() => {
    if (!enabled || resizing) {
      return;
    }
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setPeeking(false);
      closeTimerRef.current = null;
    }, PEEK_CLOSE_DELAY_MS);
  }, [cancelClose, enabled, resizing, setPeeking]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  return { onPeekEnter, onPeekLeave };
}

function SidebarFloatingFrame({
  children,
  className,
  collapseMode,
  onPeekEnter,
  onPeekLeave,
  panelId,
  peekEnabled,
  side,
  visible,
  ...props
}: React.ComponentProps<"div"> & {
  collapseMode: SidebarCollapseMode;
  onPeekEnter: () => void;
  onPeekLeave: () => void;
  panelId: string;
  peekEnabled: boolean;
  side: SidebarSide;
  visible: boolean;
}) {
  const {
    isMobile,
    open,
    overlayRoot,
    peeking,
    resizing,
    setOpen,
    setPeeking,
    width,
  } = useSidebar();

  return (
    <div
      className="group/sidebar peer relative flex h-full overflow-visible text-sidebar-foreground"
      data-slot="sidebar"
      data-side={side}
      data-state={open ? "expanded" : "collapsed"}
      data-peeking={peeking ? "true" : undefined}
      data-collapsible={open ? "" : collapseMode}
      data-collapse-mode={collapseMode}
      data-variant="floating"
    >
      <div data-slot="sidebar-gap" className="h-full w-0 shrink-0" />
      {peekEnabled ? (
        <div
          data-slot="sidebar-hover-target"
          className={cn(
            "absolute inset-y-0 z-20 w-4",
            side === "left" ? "left-0" : "right-0"
          )}
          onMouseEnter={onPeekEnter}
          onMouseLeave={onPeekLeave}
        />
      ) : null}
      <Dialog
        open={visible}
        disablePointerDismissal={!isMobile}
        modal={isMobile}
        onOpenChange={(next) => {
          if (next) {
            setOpen(true);
            return;
          }
          setOpen(false);
          setPeeking(false);
        }}
      >
        {overlayRoot ? (
          <DialogPortal container={overlayRoot} keepMounted={peekEnabled}>
            {isMobile ? (
              <DialogPrimitive.Backdrop
                data-slot="dialog-overlay"
                className="absolute inset-0 isolate bg-black/70 pointer-events-auto data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 duration-100"
              />
            ) : null}
            <DialogPrimitive.Viewport
              data-slot="sidebar-floating-viewport"
              className="absolute inset-0 isolate z-40 flex pointer-events-none"
            >
              <DialogPrimitive.Popup
                id={panelId}
                data-slot="sidebar-container"
                data-sidebar="sidebar"
                finalFocus={peeking ? false : undefined}
                initialFocus={peeking ? false : undefined}
                onMouseEnter={peekEnabled ? onPeekEnter : undefined}
                onMouseLeave={peekEnabled ? onPeekLeave : undefined}
                className={cn(
                  "pointer-events-auto absolute inset-y-2 z-10 flex outline-none",
                  side === "left" ? "left-2" : "right-2",
                  !resizing &&
                    "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 duration-200 ease-out",
                  !resizing &&
                    (side === "left"
                      ? "data-closed:slide-out-to-left data-open:slide-in-from-left"
                      : "data-closed:slide-out-to-right data-open:slide-in-from-right"),
                  className
                )}
                style={{ width }}
                {...props}
              >
                <DialogTitle className="sr-only">Sidebar</DialogTitle>
                <div
                  data-slot="sidebar-inner"
                  className={sidebarVariants({ side, variant: "floating" })}
                >
                  {children}
                </div>
              </DialogPrimitive.Popup>
            </DialogPrimitive.Viewport>
          </DialogPortal>
        ) : null}
      </Dialog>
    </div>
  );
}

function Sidebar({
  children,
  className,
  collapseMode: collapseModeProp,
  collapsible,
  handle: handleProp,
  side = "left",
  variant = "sidebar",
  ...props
}: React.ComponentProps<"div"> & {
  collapseMode?: SidebarCollapseMode;
  collapsible?: LegacyCollapsible;
  handle?: SidebarHandle;
  side?: SidebarSide;
  variant?: SidebarVariant;
}) {
  const existing = useOptionalSidebar();

  if (!existing && handleProp) {
    return (
      <SidebarProvider handle={handleProp} className="contents">
        <SidebarPanel
          className={className}
          collapseMode={collapseModeProp}
          collapsible={collapsible}
          side={side}
          variant={variant}
          {...props}
        >
          {children}
        </SidebarPanel>
      </SidebarProvider>
    );
  }

  return (
    <SidebarPanel
      className={className}
      collapseMode={collapseModeProp}
      collapsible={collapsible}
      side={side}
      variant={variant}
      {...props}
    >
      {children}
    </SidebarPanel>
  );
}

function SidebarPanel({
  children,
  className,
  collapseMode: collapseModeProp,
  collapsible,
  side = "left",
  variant = "sidebar",
  ...props
}: React.ComponentProps<"div"> & {
  collapseMode?: SidebarCollapseMode;
  collapsible?: LegacyCollapsible;
  side?: SidebarSide;
  variant?: SidebarVariant;
}) {
  const {
    collapseMode: collapseModeFromContext,
    handle,
    isMobile,
    open,
    peeking,
    resizing,
    setOpen,
    setPeeking,
    width,
  } = useSidebar();
  const collapseMode = resolveCollapseMode({
    collapseMode: collapseModeProp,
    collapsible,
    fromContext: collapseModeFromContext,
    side,
  });
  const panelId = handle.panelId;
  const peekEnabled = collapseMode === "hover" && !open && !isMobile;
  const { onPeekEnter, onPeekLeave } = usePeekHover({
    enabled: peekEnabled,
    resizing,
    setPeeking,
  });
  const visible = collapseMode === "none" || open || peeking;
  const inFlow = variant !== "floating" && (collapseMode === "none" || open);

  const layoutValue = React.useMemo<SidebarLayoutContextValue>(
    () => ({ collapseMode, panelId, side, variant }),
    [collapseMode, panelId, side, variant]
  );

  if (variant === "floating") {
    return (
      <SidebarLayoutContext value={layoutValue}>
        <SidebarFloatingFrame
          className={className}
          collapseMode={collapseMode}
          panelId={panelId}
          peekEnabled={peekEnabled}
          onPeekEnter={onPeekEnter}
          onPeekLeave={onPeekLeave}
          side={side}
          visible={visible}
          {...props}
        >
          {children}
        </SidebarFloatingFrame>
      </SidebarLayoutContext>
    );
  }

  if (collapseMode === "none") {
    return (
      <SidebarLayoutContext value={layoutValue}>
        <div
          id={panelId}
          data-slot="sidebar"
          data-side={side}
          data-state="expanded"
          data-variant={variant}
          data-collapse-mode="none"
          className={cn("relative hidden h-full md:flex", className)}
          style={{ width }}
          {...props}
        >
          <div
            data-slot="sidebar-inner"
            className={cn(sidebarVariants({ side, variant }))}
          >
            {children}
          </div>
        </div>
      </SidebarLayoutContext>
    );
  }

  if (isMobile) {
    return (
      <SidebarLayoutContext value={layoutValue}>
        {open ? (
          <button
            type="button"
            data-slot="sidebar-backdrop"
            aria-label="Close sidebar"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <div
          id={panelId}
          data-slot="sidebar"
          data-mobile="true"
          data-side={side}
          data-state={open ? "expanded" : "collapsed"}
          data-variant={variant}
          className={cn(
            "fixed inset-y-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-lg transition-transform duration-200 ease-out md:hidden",
            side === "left" ? "left-0 border-r" : "right-0 border-l",
            open
              ? "translate-x-0"
              : side === "left"
                ? "-translate-x-full"
                : "translate-x-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </SidebarLayoutContext>
    );
  }

  return (
    <SidebarLayoutContext value={layoutValue}>
      <div
        className="group/sidebar peer relative hidden h-full overflow-visible text-sidebar-foreground md:flex"
        data-slot="sidebar"
        data-side={side}
        data-state={open ? "expanded" : "collapsed"}
        data-peeking={peeking ? "true" : undefined}
        data-collapsible={open ? "" : collapseMode}
        data-collapse-mode={collapseMode}
        data-variant={variant}
      >
        <div
          data-slot="sidebar-gap"
          className={cn(
            "relative h-full shrink-0",
            !resizing && "transition-[width] duration-200 ease-out"
          )}
          style={{ width: inFlow ? width : 0 }}
        />
        {peekEnabled ? (
          <div
            data-slot="sidebar-hover-target"
            className={cn(
              "absolute inset-y-0 z-20 w-4",
              side === "left" ? "left-0" : "right-0"
            )}
            onMouseEnter={onPeekEnter}
            onMouseLeave={onPeekLeave}
          />
        ) : null}
        <div
          id={panelId}
          data-slot="sidebar-container"
          inert={!visible ? true : undefined}
          aria-hidden={visible ? undefined : true}
          onMouseEnter={peekEnabled ? onPeekEnter : undefined}
          onMouseLeave={peekEnabled ? onPeekLeave : undefined}
          className={cn(
            "absolute inset-y-0 z-10 flex h-full",
            side === "left" ? "left-0" : "right-0",
            peeking && !open && "z-30",
            !visible &&
              (side === "left" ? "-translate-x-full" : "translate-x-full"),
            !resizing && "transition-transform duration-200 ease-out",
            className
          )}
          style={{ width }}
          {...props}
        >
          <div
            data-slot="sidebar-inner"
            data-sidebar="sidebar"
            className={cn(
              sidebarVariants({ side, variant }),
              peeking &&
                !open &&
                "bg-sidebar shadow-lg ring-1 ring-foreground/10"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </SidebarLayoutContext>
  );
}

function SidebarTrigger({
  className,
  handle,
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & {
  handle?: SidebarHandle;
}) {
  const { handle: resolvedHandle, open, toggleSidebar } = useSidebar(handle);

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      aria-controls={resolvedHandle.panelId}
      aria-expanded={open}
      className={cn("size-7", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

function SidebarResizeHandle({
  className,
  onPointerDown,
  ...props
}: React.ComponentProps<"button">) {
  const {
    isMobile,
    maxWidth,
    minWidth,
    open,
    peeking,
    setPeeking,
    setResizing,
    setWidth,
    toggleSidebar,
    width,
  } = useSidebar();
  const layout = React.use(SidebarLayoutContext);
  const side = layout?.side ?? "left";
  const collapseMode = layout?.collapseMode ?? "offcanvas";

  const onPointerDownHandle = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      event.preventDefault();
      const target = event.currentTarget;
      const originX = event.clientX;
      const originWidth = width;
      let dragged = false;

      target.setPointerCapture(event.pointerId);
      setResizing(true);

      const onMove = (moveEvent: PointerEvent) => {
        const delta =
          side === "left"
            ? moveEvent.clientX - originX
            : originX - moveEvent.clientX;
        if (Math.abs(delta) >= RESIZE_CLICK_THRESHOLD_PX) {
          dragged = true;
        }
        if (open || peeking) {
          setWidth(originWidth + delta);
        }
      };

      const onUp = (upEvent: PointerEvent) => {
        target.releasePointerCapture(upEvent.pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        setResizing(false);
        if (!dragged) {
          toggleSidebar();
        }
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [onPointerDown, open, peeking, setResizing, setWidth, side, toggleSidebar, width]
  );

  if (isMobile) {
    return null;
  }

  return (
    <button
      type="button"
      data-sidebar="rail"
      data-slot="sidebar-resize-handle"
      aria-label={open ? "Resize sidebar" : "Expand sidebar"}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(width)}
      role="separator"
      title={open ? "Drag to resize, click to collapse" : "Click to expand"}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-3 cursor-col-resize touch-none items-center justify-center md:flex",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent",
        "hover:after:bg-foreground-tertiary focus-visible:after:bg-ring",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        "group-data-[side=left]/sidebar:right-0 group-data-[side=left]/sidebar:translate-x-1/2",
        "group-data-[side=right]/sidebar:left-0 group-data-[side=right]/sidebar:-translate-x-1/2",
        className
      )}
      onPointerDown={onPointerDownHandle}
      onMouseEnter={() => {
        if (!open && collapseMode === "hover") {
          setPeeking(true);
        }
      }}
      {...props}
    />
  );
}

function SidebarRail(props: React.ComponentProps<"button">) {
  return <SidebarResizeHandle {...props} />;
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-background-primary relative flex min-w-0 w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  );
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-background-primary h-8 w-full shadow-none", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("mt-auto flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 font-medium text-xs outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-7 text-sm",
        lg: "h-8 text-sm",
        sm: "h-7 text-xs",
      },
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background-primary shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
    },
  }
);

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : "button";
  const { isMobile, peeking, state } = useSidebar();

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ className, size, variant }))}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  const resolvedTooltip =
    typeof tooltip === "string" ? { children: tooltip } : tooltip;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent
        side="right"
        hidden={state !== "collapsed" || peeking || isMobile}
        {...resolvedTooltip}
      />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-medium text-sidebar-foreground text-xs tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  const width = React.useMemo(() => `${Math.floor(Math.random() * 40) + 50}%`, []);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "ml-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-sidebar-border border-l py-0.5 pl-2.5",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
  isActive?: boolean;
  size?: "sm" | "md";
}) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 w-full -translate-x-px items-center gap-2 overflow-hidden rounded-sm px-2 text-sidebar-foreground outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        className
      )}
      {...props}
    />
  );
}

export {
  createSidebarHandle,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarResizeHandle,
  SidebarSeparator,
  SidebarTrigger,
  sidebarVariants,
  useSidebar,
};
export type {
  CreateSidebarHandleOptions,
  SidebarCollapseMode,
  SidebarHandle,
  SidebarSide,
};
