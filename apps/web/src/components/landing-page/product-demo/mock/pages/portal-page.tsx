import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Settings2 } from "lucide-react";
import { motion } from "motion/react";
import { MockPortalThreadRow } from "../components/portal-thread-row";
import { blurSlideContainerVariants } from "../motion-variants";
import { PortalLayout } from "../portal-layout";
import type { DemoThread } from "../types";

type MockPortalPageProps = {
  threads: DemoThread[];
  hoveredThreadId?: string;
};

export const MockPortalPage = ({
  threads,
  hoveredThreadId,
}: MockPortalPageProps) => {
  return (
    <PortalLayout activeNavItem="Threads">
      <div className="w-full flex-1">
        <div className="flex flex-col gap-8 mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-5xl">
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="gap-4">Threads</CardTitle>
              <CardAction side="right">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="View options (demo)"
                >
                  <Settings2 aria-hidden="true" />
                  View
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="overflow-y-auto gap-0 items-center">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={blurSlideContainerVariants}
                className="w-full flex flex-col"
                aria-label="Public portal threads (demo)"
              >
                {threads.map((thread) => (
                  <MockPortalThreadRow
                    key={thread.id}
                    thread={thread}
                    isSimulatedHover={thread.id === hoveredThreadId}
                  />
                ))}
              </motion.div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
};
