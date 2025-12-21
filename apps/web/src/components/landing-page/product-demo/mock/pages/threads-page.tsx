import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { FilterIcon, Settings2 } from "lucide-react";
import { motion } from "motion/react";
import { MockThreadRow } from "../components/thread-row";
import { blurSlideContainerVariants } from "../motion-variants";
import type { DemoThread } from "../types";

type MockThreadsPageProps = {
  threads: DemoThread[];
  hoveredThreadId?: string;
};

export const MockThreadsPage = ({
  threads,
  hoveredThreadId,
}: MockThreadsPageProps) => {
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
        <motion.div
          initial="hidden"
          animate="visible"
          variants={blurSlideContainerVariants}
          className="w-full flex flex-col items-center"
          aria-label="Threads (demo)"
          key="threads-page"
        >
          {threads.map((thread) => (
            <MockThreadRow
              key={thread.id}
              thread={thread}
              isSimulatedHover={thread.id === hoveredThreadId}
            />
          ))}
        </motion.div>
      </CardContent>
    </Card>
  );
};
