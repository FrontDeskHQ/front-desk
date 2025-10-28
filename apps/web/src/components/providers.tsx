import { SidebarProvider } from "@workspace/ui/components/sidebar";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { PostHogConfig } from "posthog-js";
import { PostHogProvider as PostHogProviderComponent } from "posthog-js/react";
import type * as React from "react";

const posthogOptions: Partial<PostHogConfig> = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2025-05-24",
};

export const PosthogProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  if (import.meta.env.DISABLE_POSTHOG) return <>{children}</>;

  return (
    <PostHogProviderComponent
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={posthogOptions}
    >
      {children}
    </PostHogProviderComponent>
  );
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PosthogProvider>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        enableColorScheme
      >
        <SidebarProvider>{children}</SidebarProvider>
      </NextThemesProvider>
    </PosthogProvider>
  );
}
