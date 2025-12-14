import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";

type NavbarProps = React.ComponentProps<"div">;

function NavbarRoot({ className, children }: NavbarProps) {
  return (
    <header
      className={cn(
        "flex w-full border-b bg-background-primary/95 backdrop-blur supports-[backdrop-filter]:bg-background-primary/60 px-8",
        className,
      )}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between py-4 w-full">
        {children}
      </div>
    </header>
  );
}

function NavbarGroup({ className, children }: NavbarProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>{children}</div>
  );
}

function NavbarLinkGroup({ className, children }: NavbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateIndicator = () => {
      const activeChild = container.querySelector(
        '[data-active="true"]',
      ) as HTMLElement;
      if (!activeChild) {
        setIndicatorStyle(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const childRect = activeChild.getBoundingClientRect();

      setIndicatorStyle({
        left: childRect.left - containerRect.left,
        width: childRect.width,
      });
    };

    // Initial update
    updateIndicator();

    // Update on resize
    const resizeObserver = new ResizeObserver(() => {
      updateIndicator();
    });

    resizeObserver.observe(container);

    // Update when children change (using MutationObserver)
    const mutationObserver = new MutationObserver(() => {
      updateIndicator();
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-active"],
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={cn("relative flex items-center gap-4", className)}
    >
      {children}
      {indicatorStyle && (
        <div
          className="absolute -bottom-4 h-0.5 bg-foreground-primary rounded-full transition-all duration-200 ease-out"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      )}
    </div>
  );
}

function NavbarLinkItem({
  className,
  children,
  active,
  ...props
}: React.ComponentProps<typeof Button> & { active: boolean }) {
  return (
    <Button
      variant="ghost"
      className={className}
      data-active={active}
      {...props}
    >
      {children}
    </Button>
  );
}

export const Navbar = Object.assign(NavbarRoot, {
  Group: NavbarGroup,
  LinkItem: NavbarLinkItem,
  LinkGroup: NavbarLinkGroup,
});
