import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Logo } from "@workspace/ui/components/logo";
import { Navbar } from "@workspace/ui/components/navbar";

type PortalLayoutProps = {
  children: React.ReactNode;
  activeNavItem?: "Threads" | "Support";
};

export const PortalLayout = ({
  children,
  activeNavItem = "Threads",
}: PortalLayoutProps) => {
  return (
    <div className="flex flex-col size-full overflow-hidden bg-background-primary">
      <Navbar className="relative">
        <Navbar.Group>
          <div className="flex items-center gap-2">
            <Avatar fallback="Acme" variant="org" size="lg" />
            <Logo.Text>Acme</Logo.Text>
          </div>
          <Navbar.LinkGroup className="ml-6">
            <Navbar.LinkItem active={activeNavItem === "Threads"} size="sm">
              Threads
            </Navbar.LinkItem>
          </Navbar.LinkGroup>
        </Navbar.Group>
        <Navbar.Group>
          <Button variant="primary" size="sm">
            Sign in
          </Button>
        </Navbar.Group>
      </Navbar>
      {children}
    </div>
  );
};
