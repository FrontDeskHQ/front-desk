/* mirror: threads list page — apps/web/src/routes/app/_workspace/_main/threads/index.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/threads/index.tsx @ 59006b69
 *   why: ThreadsList reads live-state org/users/threads, router Link, Filter state
 * reuse: Card*, Button, Breadcrumb*, MockThreadRow, Avatar (via row)
 * state: open inbox from demoThreads props; Display/Filter chrome inert
 * marketing: none here — callers own crop, motion, simulated hover
 */

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { FilterIcon, Settings2 } from "lucide-react";

import { MockThreadRow } from "./thread-row";
import type { DemoThread } from "./types";

interface MockThreadsPageProps {
  threads: DemoThread[];
  hoveredThreadId?: string;
  className?: string;
  /** Subtitle after Threads breadcrumb (e.g. "Open"). */
  subTitle?: string;
}

export function MockThreadsPage({
  threads,
  hoveredThreadId,
  className,
  subTitle,
}: MockThreadsPageProps) {
  return (
    <Card
      className={["flex flex-col overflow-hidden", className]
        .filter(Boolean)
        .join(" ")}
    >
      <CardHeader>
        <CardTitle className="gap-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Threads</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {subTitle ? (
            <span className="text-muted-foreground text-sm">{subTitle}</span>
          ) : null}
          <Button variant="ghost" size="sm" tabIndex={-1} aria-hidden>
            <FilterIcon />
            Filter
          </Button>
        </CardTitle>
        <CardAction side="right">
          <Button variant="ghost" size="sm" tabIndex={-1} aria-hidden>
            <Settings2 />
            Display
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="overflow-hidden p-0 gap-0 flex-1 min-h-0">
        <div className="overflow-hidden flex-1 p-4">
          <div className="flex flex-col gap-0 items-stretch w-full">
            {threads.map((thread) => (
              <MockThreadRow
                key={thread.id}
                thread={thread}
                isSimulatedHover={thread.id === hoveredThreadId}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
