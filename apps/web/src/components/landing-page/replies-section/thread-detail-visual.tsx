/* marketing: DesignFrame scale-to-fit over shared MockAppFrame + MockThreadDetailPage
 * state: billing refund thread In progress, assigned to Pedro; SI tab open with Draft Reply
 */

import { Card } from "@workspace/ui/components/card";
import { useEffect, useRef, useState } from "react";

import { MockAppFrame } from "../shared/app-chrome";
import { MockThreadDetailPage } from "../shared/thread-detail-mock";

import {
  CUSTOMER_MESSAGE,
  SI_DRAFT,
  SI_MESSAGES,
  THREAD,
} from "./data";

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

export function ThreadDetailVisual() {
  return (
    <div
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- inert product mirror, not a real <img>
      role="img"
      aria-label="FrontDesk thread view with Support Intelligence drafting a refund reply for a duplicate billing charge"
    >
      <div inert className="pointer-events-none select-none">
        <DesignFrame>
          <MockAppFrame activeSidebarItem={null}>
            <Card className="relative m-2 ml-0 h-auto flex-1 overflow-hidden">
              <MockThreadDetailPage
                layout="static"
                thread={THREAD}
                headerMessage={CUSTOMER_MESSAGE}
                replies={[]}
                repliesHeadingVisible={false}
                toolbarMode="support-intelligence"
                siDraft={SI_DRAFT}
                siMessages={SI_MESSAGES}
              />
            </Card>
          </MockAppFrame>
        </DesignFrame>
      </div>
    </div>
  );
}
