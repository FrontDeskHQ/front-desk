/* marketing: DesignFrame scale-to-fit over shared MockAppFrame + MockSignalsPage
 * state: Signals nav active; 3 mixed-urgency reads (reply, duplicate bundle, close)
 */

import { Card } from "@workspace/ui/components/card";
import { useEffect, useRef, useState } from "react";

import { MockAppFrame } from "../shared/app-chrome";

import { MockSignalsPage } from "./signals-mock/signals-page";

/** Design canvas — full desktop chrome, then scaled into the section band. */
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
      className="relative aspect-video w-full overflow-hidden rounded-md border border-border-secondary bg-background-primary shadow-sm"
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

export function SignalsVisual() {
  return (
    <div
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- inert product mirror, not a real <img>
      role="img"
      aria-label="FrontDesk Signals page showing three items that need attention: a churn-risk webhook thread, a duplicate rate-limit report, and an SSO issue ready to close"
    >
      <div inert className="pointer-events-none select-none">
        <DesignFrame>
          <MockAppFrame activeSidebarItem="signals">
            <Card className="relative m-2 ml-0 h-auto flex-1 overflow-hidden">
              <MockSignalsPage />
            </Card>
          </MockAppFrame>
        </DesignFrame>
      </div>
    </div>
  );
}
