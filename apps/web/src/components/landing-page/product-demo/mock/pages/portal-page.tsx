import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Logo } from "@workspace/ui/components/logo";
import { Navbar } from "@workspace/ui/components/navbar";
import { Settings2 } from "lucide-react";
import { motion } from "motion/react";
import { MockPortalThreadRow } from "../components/portal-thread-row";
import { blurSlideContainerVariants } from "../motion-variants";
import type { DemoThread } from "../types";

type MockPortalPageProps = {
  threads: DemoThread[];
};

export const MockPortalPage = ({ threads }: MockPortalPageProps) => {
  return (
    <div className="flex flex-col size-full overflow-hidden bg-background-primary">
      <Navbar className="relative">
        <Navbar.Group>
          <div className="flex items-center gap-2">
            <Avatar fallback="Acme" variant="org" size="lg" />
            <Logo.Text>Acme</Logo.Text>
          </div>
          <Navbar.LinkGroup className="ml-6">
            <Navbar.LinkItem active={true} size="sm">
              Threads
            </Navbar.LinkItem>
          </Navbar.LinkGroup>
        </Navbar.Group>
        <Navbar.Group>
          <Button variant="default" size="sm">
            Sign in
          </Button>
        </Navbar.Group>
      </Navbar>
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
                  <MockPortalThreadRow key={thread.id} thread={thread} />
                ))}
              </motion.div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
