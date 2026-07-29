/* marketing: product-demo outer border over shared MockAppFrame */

import { MockAppFrame as SharedMockAppFrame } from "../../shared/app-chrome";

interface ProductDemoAppFrameProps {
  children: React.ReactNode;
  activeSidebarItem?: "threads";
  ariaLabel?: string;
  showSidebar?: boolean;
}

export const MockAppFrame = ({
  children,
  activeSidebarItem = "threads",
  ariaLabel = "FrontDesk app preview (non-interactive)",
  showSidebar = true,
}: ProductDemoAppFrameProps) => (
  <div
    className="flex h-full w-full overflow-hidden border bg-background-primary"
    aria-label={ariaLabel}
  >
    {showSidebar ? (
      <SharedMockAppFrame activeSidebarItem={activeSidebarItem}>
        {children}
      </SharedMockAppFrame>
    ) : (
      children
    )}
  </div>
);
