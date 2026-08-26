import { SidebarTrigger, useSidebar } from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";

export function CollapsedSidebarTrigger({
  className,
}: {
  className?: string;
}) {
  const { open, openMobile } = useSidebar();

  return (
    <div
      data-slot={open ? undefined : "collapsed-sidebar-trigger"}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-20 flex h-10 items-center pl-2",
        // Below lg the panel is an overlay, so the trigger stays visible as a
        // "show" control even when the desktop pin state is expanded.
        open && "hidden max-lg:flex",
        openMobile && "max-lg:hidden",
        className
      )}
    >
      <SidebarTrigger className="pointer-events-auto" />
    </div>
  );
}
