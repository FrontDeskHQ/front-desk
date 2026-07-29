/* rebuild: marketing-only — the product does not render a scaled device frame.
 * reuse: MockAppFrame
 * state: active sidebar item from props; children fill the main Card slot
 * marketing: the one product-mock shell. Owns the inert contract for every
 *   mirror on the page (role=img + aria-label, `inert`, pointer-events-none),
 *   and the 1280×720 design canvas scaled to whatever width the section band
 *   gives it. Mirrors below this point never re-declare any of that.
 */

import type * as React from "react";
import { useEffect, useRef } from "react";

import type { MockSidebarActive } from "./mock-sidebar";
import { MockAppFrame } from "./mock-app-frame";

/** Design canvas — full desktop chrome, then scaled into the section band. */
const FD_DESIGN_W = 1280;
const FD_DESIGN_H = 720; // 16:9

/** The main content Card every mock page sits in, beside the sidebar. */
export const MOCK_MAIN_CARD_CLASS =
  "relative m-2 ml-0 h-auto flex-1 overflow-hidden";

interface ProductMockFrameProps {
  ariaLabel: string;
  activeSidebarItem?: MockSidebarActive;
  children: React.ReactNode;
}

export function ProductMockFrame({
  ariaLabel,
  activeSidebarItem,
  children,
}: ProductMockFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) {
      return;
    }

    // Written imperatively: a resize should cost a style write, not a re-render
    // of the whole mock tree (which would remount editors and markdown).
    const update = () => {
      const scale = frame.clientWidth / FD_DESIGN_W;
      canvas.style.transform = `scale(${scale})`;
      canvas.style.opacity = scale > 0 ? "1" : "0";
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  return (
    <div role="img" aria-label={ariaLabel}>
      <div inert className="pointer-events-none select-none">
        <div
          ref={frameRef}
          className="relative aspect-video w-full overflow-hidden rounded-md border border-border-secondary bg-background-primary shadow-sm"
        >
          <div
            ref={canvasRef}
            className="absolute top-0 left-0 origin-top-left opacity-0"
            style={{ height: FD_DESIGN_H, width: FD_DESIGN_W }}
          >
            <MockAppFrame activeSidebarItem={activeSidebarItem}>
              {children}
            </MockAppFrame>
          </div>
        </div>
      </div>
    </div>
  );
}
