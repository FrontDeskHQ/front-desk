import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { FilterIcon, Settings2 } from "lucide-react";
import { MockThreadRow } from "../components/thread-row";
import type { DemoThread } from "../types";

type MockThreadsPageProps = {
  threads: DemoThread[];
};

export const MockThreadsPage = ({ threads }: MockThreadsPageProps) => {
  return (
    <Card className="flex-1 relative m-2 ml-0 h-auto">
      <CardHeader>
        <CardTitle className="gap-4">Threads</CardTitle>
        <CardAction side="right">
          <Button variant="ghost" size="sm" aria-label="Filter threads (demo)">
            <FilterIcon aria-hidden="true" />
            Filter
          </Button>
          <Button variant="ghost" size="sm" aria-label="Display options (demo)">
            <Settings2 aria-hidden="true" />
            Display
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="gap-0 items-center">
        <ul
          className="w-full flex flex-col items-center"
          aria-label="Threads (demo)"
        >
          {threads.map((thread) => (
            <MockThreadRow key={thread.id} thread={thread} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
