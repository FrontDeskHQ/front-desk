import { SidebarTrigger, useSidebar } from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";

export function CollapsedSidebarTrigger({
  className,
}: {
  className?: string;
}) {
  const { open } = useSidebar();

  if (open) {
    return null;
  }

  return (
    <div
      data-slot="collapsed-sidebar-trigger"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-20 flex h-10 items-center pl-2",
        className
      )}
    >
      <SidebarTrigger className="pointer-events-auto" />
    </div>
  );
}
