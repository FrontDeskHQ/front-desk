"use client";

import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";

type TreeGuide = "join" | "skip";

interface TreeIndicatorStretch {
  stretchStart?: number;
  stretchEnd?: number;
  stretchSide?: number;
}

interface TreeItemPositionContextValue {
  guides: TreeGuide[];
  isLast: boolean;
  index: number;
  depth: number;
}

const TreeItemPositionContext =
  React.createContext<TreeItemPositionContextValue | null>(null);

const indicatorClassName =
  "relative w-4 shrink-0 self-stretch overflow-visible";

/** Matches `gap-1` on tree rows and lists. */
const TREE_ROW_GAP_PX = 4;

/** Radius for the join branch corner. */
const TREE_CORNER_RADIUS_PX = 4;

function useTreeItemPosition() {
  const ctx = React.use(TreeItemPositionContext);
  if (!ctx) {
    throw new Error("Tree parts must be used within <TreeList> → <TreeItem>.");
  }
  return ctx;
}

function useTreeItemPositionOptional() {
  return React.use(TreeItemPositionContext);
}

function guidesForChildren(parent: TreeItemPositionContextValue): TreeGuide[] {
  if (parent.guides.length === 0) {
    return parent.isLast ? [] : ["join"];
  }

  return [...parent.guides, parent.isLast ? "skip" : "join"];
}

function verticalLineStyle({
  stretchStart = 0,
  stretchEnd = 0,
  span = 1,
}: TreeIndicatorStretch & { span?: number }): React.CSSProperties | undefined {
  if (stretchStart === 0 && stretchEnd === 0) {
    return undefined;
  }

  const spanPercent = span * 100;

  return {
    height: `calc(${spanPercent}% + ${stretchStart + stretchEnd}px)`,
    top: -stretchStart,
  };
}

type TreeListProps = React.ComponentProps<"ul">;

function TreeList({ className, children, ...props }: TreeListProps) {
  const parentPosition = React.use(TreeItemPositionContext);
  const guidesForItems: TreeGuide[] = parentPosition
    ? guidesForChildren(parentPosition)
    : [];
  const childDepth = parentPosition ? parentPosition.depth + 1 : 0;

  const items = React.useMemo(() => {
    const childNodes = Array.isArray(children)
      ? children
      : children
        ? [children]
        : [];

    return childNodes.filter(React.isValidElement);
  }, [children]);

  return (
    <ul
      data-slot="tree-list"
      className={cn("m-0 flex list-none flex-col p-0", className)}
      {...props}
    >
      {items.map((child, index) => {
        const isLast = index === items.length - 1;

        return (
          <TreeItemPositionContext.Provider
            key={child.key ?? `tree-item-${index}`}
            value={{
              depth: childDepth,
              guides: guidesForItems,
              index,
              isLast,
            }}
          >
            {child}
          </TreeItemPositionContext.Provider>
        );
      })}
    </ul>
  );
}

type TreeItemProps = React.ComponentProps<"li">;

function TreeItem({ className, children, ...props }: TreeItemProps) {
  const position = useTreeItemPosition();

  return (
    <TreeItemPositionContext.Provider value={position}>
      <li
        data-slot="tree-item"
        className={cn("flex flex-col", className)}
        {...props}
      >
        {children}
      </li>
    </TreeItemPositionContext.Provider>
  );
}

type TreeItemRowProps = React.ComponentProps<"div">;

function TreeItemRow({ className, children, ...props }: TreeItemRowProps) {
  const { guides, isLast, depth } = useTreeItemPosition();

  return (
    <div
      data-slot="tree-item-row"
      className={cn(
        "flex min-h-8 min-w-0 items-stretch gap-1 overflow-visible text-sm",
        className
      )}
      {...props}
    >
      {guides.map((guide, index) =>
        guide === "join" ? (
          <TreeSkip
            // biome-ignore lint/suspicious/noArrayIndexKey: guide columns are positional
            key={index}
            stretchStart={TREE_ROW_GAP_PX}
          />
        ) : (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: guide columns are positional
            key={index}
            data-slot="tree-gap"
            className={indicatorClassName}
          />
        )
      )}
      {depth > 0 ? (
        <TreeJoin isLast={isLast} stretchStart={TREE_ROW_GAP_PX} />
      ) : null}
      <div
        data-slot="tree-item-content"
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-foreground-primary"
      >
        {children}
      </div>
    </div>
  );
}

type TreeJoinProps = React.ComponentProps<"div"> &
  TreeIndicatorStretch & {
    isLast?: boolean;
  };

function TreeJoin({
  className,
  isLast: isLastProp,
  stretchStart = 0,
  stretchEnd = 0,
  stretchSide = 0,
  style,
  ...props
}: TreeJoinProps) {
  const contextIsLast = useTreeItemPositionOptional()?.isLast;
  const isLast = isLastProp ?? contextIsLast ?? false;

  return (
    <div
      data-slot="tree-join"
      className={cn(indicatorClassName, className)}
      style={style}
      {...props}
    >
      <span
        aria-hidden
        className="absolute left-1/2 box-border border-foreground-tertiary border-b border-l"
        style={{
          borderBottomLeftRadius: TREE_CORNER_RADIUS_PX,
          height: stretchStart > 0 ? `calc(50% + ${stretchStart}px)` : "50%",
          top: stretchStart > 0 ? -stretchStart : 0,
          width: stretchSide > 0 ? `calc(50% + ${stretchSide}px)` : "50%",
        }}
      />
      {isLast ? null : (
        <span
          aria-hidden
          className="absolute left-1/2 border-l border-foreground-tertiary"
          style={{
            top: "50%",
            width: 0,
            ...(stretchEnd > 0
              ? { height: `calc(50% + ${stretchEnd}px)` }
              : { bottom: 0 }),
          }}
        />
      )}
    </div>
  );
}

type TreeSkipProps = React.ComponentProps<"div"> &
  Omit<TreeIndicatorStretch, "stretchSide">;

function TreeSkip({
  className,
  stretchStart = 0,
  stretchEnd = 0,
  style,
  ...props
}: TreeSkipProps) {
  const verticalStyle = verticalLineStyle({ stretchEnd, stretchStart });

  return (
    <div
      data-slot="tree-skip"
      className={cn(indicatorClassName, className)}
      style={style}
      {...props}
    >
      <span
        aria-hidden
        className="absolute left-1/2 border-l border-foreground-tertiary"
        style={{
          width: 0,
          ...(verticalStyle ? verticalStyle : { top: 0, bottom: 0 }),
        }}
      />
    </div>
  );
}

export { TreeItem, TreeItemRow, TreeJoin, TreeList, TreeSkip, TREE_ROW_GAP_PX };

export type { TreeGuide, TreeIndicatorStretch };
