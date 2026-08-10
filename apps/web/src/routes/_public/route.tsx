/** biome-ignore-all lint/a11y/useAnchorContent: <explanation> */
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Logo } from "@workspace/ui/components/logo";
import { HorizontalLine } from "@workspace/ui/components/surface";
import { cn } from "@workspace/ui/lib/utils";
import { MenuIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { AuthButtonGroup } from "~/components/auth";
import { FooterWordmark } from "~/components/landing-page/shared/footer-wordmark";

export const Route = createFileRoute("/_public")({
  component: RouteComponent,
});

function RouteComponent() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    // overflow-x-clip: the hero's glare backdrop breaks the grid to 100vw,
    // which overhangs by the scrollbar width. `clip` swallows it without
    // creating a scroll container, so the sticky header keeps working.
    <div className="w-full min-h-screen flex flex-col items-center relative overflow-x-clip">
      <header
        className={cn(
          "h-15 border-b flex justify-center w-full px-4 sticky top-0 backdrop-blur-sm z-50 bg-background-primary/90 transition-colors",
          menuOpen && "border-0 bg-transparent"
        )}
      >
        <div className="flex items-center h-full w-full max-w-[90rem] justify-between">
          <div className="flex gap-px">
            <Link to="/" className="flex items-center gap-2 mr-4">
              <Logo>
                <Logo.Icon />
              </Logo>
              <h1 className="text-lg font-normal">FrontDesk</h1>
            </Link>
            <Button
              variant="link"
              className="hidden md:inline-flex"
              render={<a href="/docs" aria-label="Docs" />}
            >
              Docs
            </Button>
            <Button
              variant="link"
              className="hidden md:inline-flex"
              render={<Link to="/updates" aria-label="Changelog" />}
            >
              Changelog
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <AuthButtonGroup />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? (
                <XIcon className="size-5" />
              ) : (
                <MenuIcon className="size-5" />
              )}
            </Button>
          </div>
        </div>
      </header>
      {/* The overlay stays mounted so it can fade; `inert` keeps the closed
          menu out of tab order and the accessibility tree, which
          `pointer-events-none opacity-0` alone does not do. */}
      <div
        inert={!menuOpen}
        aria-hidden={!menuOpen}
        className={cn(
          "fixed inset-0 z-40 bg-background-primary flex flex-col items-center pt-15 transition-opacity duration-200 ease-out md:hidden",
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <nav className="flex flex-col gap-2 w-full max-w-[90rem] p-4">
          <a
            href="/docs"
            className="py-2 text-lg"
            onClick={() => setMenuOpen(false)}
          >
            Docs
          </a>
          <Link
            to="/updates"
            className="py-2 text-lg"
            onClick={() => setMenuOpen(false)}
          >
            Changelog
          </Link>
        </nav>
      </div>
      <div className="mx-auto w-full max-w-[90rem]">
        <Outlet />
        <HorizontalLine variant="full" lineStyle="solid" />
        <footer className="grid w-full grid-cols-12 border-x">
          <div className="col-span-full grid grid-cols-6 px-4 py-12">
            <div className="p-4 gap-4 col-span-full md:col-span-2 lg:pr-30 items-center flex flex-col md:items-start text-center md:text-start">
              <div className="flex gap-2">
                <Logo>
                  <Logo.Icon className="size-6" />
                </Logo>
                <span className="text-base font-medium">FrontDesk</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Care for every customer. Even when you&apos;re busy.
              </div>
            </div>
            <div className="p-4 space-y-4 col-span-3 md:col-start-4 md:col-span-1">
              <div className="text-base font-medium">Resources</div>
              <div className="flex flex-col gap-2">
                <a href="https://support.tryfrontdesk.app">Support</a>
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
          <div className="col-span-full select-none px-8 md:px-16">
            <FooterWordmark />
          </div>
        </footer>
      </div>
    </div>
  );
}
