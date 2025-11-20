import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Logo } from "@workspace/ui/components/logo";
import { HorizontalLine } from "@workspace/ui/components/surface";

import { AuthButtonGroup } from "~/components/auth";

export const Route = createFileRoute("/_public")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-full min-h-screen flex flex-col items-center relative">
      <header className="h-15 border-b flex justify-center w-full px-4 sticky top-0 backdrop-blur-sm z-50 bg-background/80">
        <div className="flex items-center h-full w-full max-w-6xl justify-between">
          <div className="flex gap-4">
            <Link to="/" className="flex items-center gap-2">
              <Logo>
                <Logo.Icon />
              </Logo>
              <h1 className="text-lg font-normal">FrontDesk</h1>
            </Link>
            <Button variant="link" asChild>
              <Link to="/" hash="pricing">
                Pricing
              </Link>
            </Button>
          </div>
          <AuthButtonGroup />
        </div>
      </header>
      <Outlet />
      <HorizontalLine variant="full" />
      <footer className="col-span-full grid grid-cols-12 border-x max-w-6xl">
        <div className="col-span-full grid grid-cols-6 px-4 py-12">
          <div className="p-4 gap-4 col-span-full md:col-span-2 lg:pr-30 items-center flex flex-col md:items-start text-center md:text-start">
            <div className="flex gap-2">
              <Logo>
                <Logo.Icon className="size-6" />
              </Logo>
              <span className="text-base font-medium">FrontDesk</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Support your customers wherever they are.
            </div>
          </div>
          <div className="p-4 space-y-4 col-span-3 md:col-start-4 md:col-span-1">
            <div className="text-base font-medium">Resources</div>
            <div className="flex flex-col gap-2">
              <a href="/#pricing">Pricing</a>
              <a href="/docs">Docs</a>
              <a href="/updates">Updates</a>
            </div>
          </div>
          <div className="p-4 space-y-4 col-span-3 md:col-start-5 md:col-span-1">
            <div className="text-base font-medium">Connect</div>
            <div className="flex flex-col gap-2">
              <a
                href="https://github.com/frontdeskhq/front-desk"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://x.com/frontdeskhq"
                target="_blank"
                rel="noopener noreferrer"
              >
                X (Twitter)
              </a>
              <a
                href="https://discord.gg/5MDHqKHrHr"
                target="_blank"
                rel="noopener noreferrer"
              >
                Discord
              </a>
            </div>
          </div>
          <div className="p-4 space-y-4 col-span-3 md:col-start-6 md:col-span-1">
            <div className="text-base font-medium">Legal</div>
            <div className="flex flex-col gap-2">
              <Link to="/legal/privacy-policy" preload={false}>
                Privacy Policy
              </Link>
              <Link to="/legal/terms-of-service" preload={false}>
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
        <div className="col-span-full text-center px-4 select-none text-muted-foreground/40">
          <svg
            width="100%"
            height="1.1em"
            viewBox="0 0 460 50"
            fill="none"
            style={{ fontSize: "calc(var(--spacing)*24)" }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>FrontDesk</title>
            <text
              x="50%"
              y="50%"
              dominantBaseline="middle"
              textAnchor="middle"
              fontFamily="inherit"
              fontWeight="450"
              fontSize="48"
              fill="transparent"
              stroke="currentColor"
              strokeWidth="1"
              style={{ letterSpacing: "-0.02em" }}
            >
              FrontDesk
            </text>
          </svg>
        </div>
      </footer>
    </div>
  );
}
