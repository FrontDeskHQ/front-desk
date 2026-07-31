/* rebuild: marketing-only — the product does not render a scaled device frame.
 * reuse: MockAppFrame
 * state: active sidebar item from props; children fill the main Card slot
 * marketing: the one product-mock shell. Owns the inert contract for every
 *   mirror on the page (role=img + aria-label, `inert`, pointer-events-none),
 *   and the 1280×720 design canvas scaled to whatever width the section band
 *   gives it. Mirrors below this point never re-declare any of that.
 */

import { cn } from "@workspace/ui/lib/utils";
import type * as React from "react";
import { useEffect, useRef } from "react";

import type { MockSidebarActive } from "./mock-sidebar";
import { MockAppFrame } from "./mock-app-frame";

/** Design canvas — full desktop chrome, then scaled into the section band. */
export const FD_DESIGN_W = 1280;
export const FD_DESIGN_H = 720; // 16:9

/** Slack thread panel — hero overlay, scaled like the app mock. */
export const SLACK_THREAD_DESIGN_W = 416;

/** Slack width as a fraction of the app mock band — keeps both mocks on one scale. */
export const SLACK_THREAD_WIDTH_RATIO = SLACK_THREAD_DESIGN_W / FD_DESIGN_W;

/** The main content Card every mock page sits in, beside the sidebar. */
export const MOCK_MAIN_CARD_CLASS =
  "relative m-2 ml-0 h-auto flex-1 overflow-hidden";

interface ScaledCanvasOptions {
  dynamicHeight?: boolean;
  /** scale = scaleSource.clientWidth / scaleBaseWidth (default: frame / designWidth) */
  scaleBaseWidth?: number;
  scaleSourceRef?: React.RefObject<HTMLElement | null>;
}

function useScaledDesignCanvas(
  designWidth: number,
  options: ScaledCanvasOptions = {},
) {
  const {
    dynamicHeight = false,
    scaleBaseWidth,
    scaleSourceRef,
  } = options;
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
      const referenceWidth =
        scaleSourceRef?.current?.clientWidth ?? frame.clientWidth;
      const denominator = scaleBaseWidth ?? designWidth;
      const scale = referenceWidth / denominator;
      canvas.style.transform = `scale(${scale})`;
      canvas.style.opacity = scale > 0 ? "1" : "0";
      if (dynamicHeight) {
        frame.style.height = `${canvas.offsetHeight * scale}px`;
      }
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(frame);
    if (dynamicHeight) {
      ro.observe(canvas);
    }
    const scaleSource = scaleSourceRef?.current;
    if (scaleSource) {
      ro.observe(scaleSource);
    }
    return () => ro.disconnect();
  }, [designWidth, dynamicHeight, scaleBaseWidth, scaleSourceRef]);

  return { frameRef, canvasRef };
}

interface ScaledContentFrameProps {
  designWidth: number;
  className?: string;
  scaleBaseWidth?: number;
  scaleSourceRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

/** Fixed-width design canvas scaled to its container — for non-16:9 mocks. */
export function ScaledContentFrame({
  designWidth,
  className,
  scaleBaseWidth,
  scaleSourceRef,
  children,
}: ScaledContentFrameProps) {
  const { frameRef, canvasRef } = useScaledDesignCanvas(designWidth, {
    dynamicHeight: true,
    scaleBaseWidth,
    scaleSourceRef,
  });

  return (
    <div
      ref={frameRef}
      className={cn("relative w-full overflow-hidden", className)}
    >
      <div
        ref={canvasRef}
        className="absolute top-0 left-0 origin-top-left opacity-0"
        style={{ width: designWidth }}
      >
        {children}
      </div>
    </div>
  );
}

interface ProductMockFrameProps {
  ariaLabel: string;
  activeSidebarItem?: MockSidebarActive;
  frameClassName?: string;
  children: React.ReactNode;
}

export function ProductMockFrame({
  ariaLabel,
  activeSidebarItem,
  frameClassName,
  children,
}: ProductMockFrameProps) {
  const { frameRef, canvasRef } = useScaledDesignCanvas(FD_DESIGN_W);

  return (
    <div role="img" aria-label={ariaLabel}>
      <div inert className="pointer-events-none select-none">
        <div
          ref={frameRef}
          className={cn(
            "relative aspect-video w-full overflow-hidden rounded-md border border-border-secondary bg-background-primary shadow-sm",
            frameClassName
          )}
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
