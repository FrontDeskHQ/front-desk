/* mirror: workspace main chrome — apps/web/src/routes/app/_workspace/_main/route.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/route.tsx @ 59006b69
 *   why: composes live AppSidebar + Widget; mock swaps in MockSidebar
 * reuse: Card, SidebarProvider, MockSidebar, ThreadPage, SignalsPage
 * state: thread view (phases 01/02) or Signals (phase 03)
 * marketing: DesignFrame 16:9 scale-to-fit; role=img inert root
 */

import { Card } from "@workspace/ui/components/card";
import { SidebarProvider } from "@workspace/ui/components/sidebar";
import { useEffect, useRef, useState } from "react";

import { MockSidebar } from "./mock-sidebar";
import { SignalsPage } from "./signals-page";
import { ThreadPage } from "./thread-page";
import type { FrontDeskPage } from "./types";

/** Design canvas for the FrontDesk preview — full desktop chrome, then scaled. */
const FD_DESIGN_W = 1280;
const FD_DESIGN_H = 720; // 16:9

function useDesignScale() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) {
      return;
    }

    const update = () => {
      setScale(el.clientWidth / FD_DESIGN_W);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { frameRef, scale };
}

function DesignFrame({ children }: { children: React.ReactNode }) {
  const { frameRef, scale } = useDesignScale();

  return (
    <div
      ref={frameRef}
      className="relative w-full aspect-video overflow-hidden rounded-md border border-border-secondary bg-background-primary shadow-sm"
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          height: FD_DESIGN_H,
          opacity: scale > 0 ? 1 : 0,
          transform: `scale(${scale})`,
          width: FD_DESIGN_W,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface FrontDeskAppProps {
  phase: number;
  page: FrontDeskPage;
}

export function FrontDeskApp({ phase, page }: FrontDeskAppProps) {
  const ariaLabel =
    page === "signals"
      ? "FrontDesk Signals, showing one high-urgency thread that needs a human reply"
      : "FrontDesk thread view, showing an open webhook support conversation";

  return (
    <div role="img" aria-label={ariaLabel}>
      <div inert className="pointer-events-none select-none">
        <DesignFrame>
          <SidebarProvider className="min-h-0 h-full overflow-hidden">
            <div className="w-full h-full flex overflow-hidden">
              <MockSidebar active={page} />
              <Card className="flex-1 relative m-2 ml-0 h-auto overflow-hidden">
                {page === "signals" ? (
                  <SignalsPage />
                ) : (
                  <ThreadPage phase={phase} />
                )}
              </Card>
            </div>
          </SidebarProvider>
        </DesignFrame>
      </div>
    </div>
  );
}
