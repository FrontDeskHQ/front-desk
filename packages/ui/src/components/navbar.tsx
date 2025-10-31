import { cn } from "../lib/utils";

interface NavbarProps {
  className?: string;
  children?: React.ReactNode;
}

function NavbarRoot({ className, children }: NavbarProps) {
  return (
    <header
      className={cn(
        "flex w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-8",
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

export const Navbar = Object.assign(NavbarRoot, {
  Group: NavbarGroup,
});
