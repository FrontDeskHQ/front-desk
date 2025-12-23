import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { Button } from "@workspace/ui/components/button";
import { DocsLayout } from "fumadocs-ui/layouts/docs";

export default function Layout({ children }: LayoutProps<"/[[...slug]]">) {
  return (
    <DocsLayout
      tree={source.pageTree}
      {...baseOptions()}
      sidebar={{
        banner: (
          <Button
            variant="outline"
            className="bg-fd-secondary/50 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground cursor-pointer"
            render={<a href="/">Go to app</a>}
          />
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
