import { Logo } from "@workspace/ui/components/logo";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <Logo>
          <Logo.Icon />
          <Logo.Text>FrontDesk</Logo.Text>
        </Logo>
      ),
    },
  };
}
