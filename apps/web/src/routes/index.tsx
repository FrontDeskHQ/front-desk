import { createFileRoute } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Icon } from "@workspace/ui/components/logo";
import { AnimatedGroup } from "@workspace/ui/components/motion";
import Dither, {
  DashedPattern,
  HorizontalLine,
} from "@workspace/ui/components/surface";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowUpRight, BookOpenText, Inbox, Zap } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

type CommitWeek = {
  days: number[];
  total: number;
  week: number;
};

const getCommitLevel = (count: number): number => {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
};

const getCommitColor = (level: number): string => {
  const colors = [
    "bg-muted-foreground/5", // 0 commits
    "bg-muted-foreground/20", // 1-3 commits
    "bg-muted-foreground/50", // 4-6 commits
    "bg-muted-foreground/70", // 7-9 commits
    "bg-muted-foreground/90", // 10+ commits
  ];
  return colors[level];
};

function CommitHeatmap({ className }: { className?: string }) {
  const [commitData, setCommitData] = useState<CommitWeek[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommitActivity = async (retryCount = 0): Promise<void> => {
      try {
        setIsLoading(true);
        const response = await fetch(
          "https://api.github.com/repos/frontdeskhq/front-desk/stats/commit_activity",
        );
        // 202 means github is generating the data, wait and retry
        if (response.status === 202) {
          if (retryCount < 3) {
            // Max 3 retries
            await new Promise((resolve) =>
              setTimeout(resolve, 3000 + retryCount ** 2 * 1000),
            );
            return fetchCommitActivity(retryCount + 1);
          }
          throw new Error(
            "Data is still being generated. Please try again later.",
          );
        }

        if (!response.ok) {
          throw new Error("Failed to fetch commit activity");
        }

        const data: CommitWeek[] = await response.json();
        setCommitData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCommitActivity();
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading commit activity...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center py-12">
        <div className="text-muted-foreground">
          Failed to load commit activity
        </div>
      </div>
    );
  }

  // Get the last 52 weeks for full year display
  const recentWeeks = commitData.slice(-52);

  // Calculate total commits
  const totalCommits = recentWeeks.reduce((sum, week) => sum + week.total, 0);

  return (
    <TooltipProvider>
      <div className="w-full flex flex-col gap-4">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalCommits}</span>{" "}
          commits in the last year
        </div>
        <div
          className={cn(
            "grid grid-rows-7 grid-flow-col grid-cols-52 w-full gap-0.5",
            className,
          )}
        >
          {recentWeeks.map((week, weekIndex) => (
            <>
              {week.days.map((commitCount, dayIndex) => {
                const level = getCommitLevel(commitCount);
                const dayDate = new Date(week.week * 1000);
                dayDate.setDate(dayDate.getDate() + dayIndex);

                const formattedDate = dayDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                });

                return (
                  <Tooltip key={`commit-${dayIndex}-${week.week}`}>
                    <TooltipTrigger
                      className={`rounded-xs aspect-square ${getCommitColor(level)} cursor-pointer`}
                    />
                    <TooltipContent side="top" sideOffset={4}>
                      <div className="flex flex-col gap-0.5">
                        <div className="font-medium">
                          {commitCount}{" "}
                          {commitCount === 1 ? "commit" : "commits"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formattedDate}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function RouteComponent() {
  return (
    <div className="w-full min-h-screen flex flex-col overflow-hidden items-center overflow-x-hidden relative">
      <header className="h-15 border-b flex justify-center w-full px-4 sticky top-0 backdrop-blur-md">
        <div className="flex items-center h-full w-full max-w-6xl justify-between">
          <a href="/" className="flex items-center gap-2">
            <Icon className="size-5" />
            <h1 className="text-lg font-normal">FrontDesk</h1>
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost">Sign In</Button>
            <Button variant="default">Sign Up</Button>
          </div>
        </div>
      </header>
      <main className="w-full max-w-6xl grid grid-cols-12">
        <section
          id="hero"
          className="col-span-12 flex flex-col items-center py-32 relative border-b border-x"
        >
          <div className="absolute inset-0 text-muted-foreground/50 grid grid-cols-[repeat(20,1fr)] -z-50 animate-in fade-in blur-in opacity-15 ease-in duration-[2s]">
            {/* <DashedPattern className="border-r" /> */}
            <Dither
              waveColor={[0.7, 0.7, 0.7]}
              disableAnimation={false}
              enableMouseInteraction={false}
              colorNum={4}
              pixelSize={3.5}
              waveAmplitude={0.3}
              waveFrequency={3}
              waveSpeed={0.05}
              className="col-span-full"
            />
            {/* <DashedPattern className="col-start-20 border-l" /> */}
          </div>
          <AnimatedGroup
            preset="blur-slide"
            className="w-full max-w-2xl text-center flex flex-col gap-10 px-6"
          >
            <h1 className="text-5xl font-bold text-center">
              Support your customers wherever they are
            </h1>
            <span className="text-xl">
              FrontDesk is the customer support tool built for speed and
              simplicity. Transform support tickets into a public, indexable,
              searchable knowledge base — getting pSEO for free
            </span>
            <div className="flex gap-4 mx-auto max-w-md w-full flex-col md:flex-row">
              <Input
                placeholder="Enter your email..."
                className="w-full dark:bg-background/75"
              />
              <Button variant="default">Request access</Button>
            </div>
          </AnimatedGroup>
        </section>
        <HorizontalLine variant="outer" />
        <DashedPattern className="col-span-full h-3 text-muted-foreground/50 border-x border-b" />
        <HorizontalLine variant="outer" />
        <section
          id="features"
          className="grid grid-cols-3 col-span-full border-x"
        >
          <div className="text-muted-foreground col-span-full font-mono uppercase pt-8 pb-4 px-4">
            01 - Main features
          </div>
          <div className="border-y min-h-48 flex flex-col px-4 py-6 gap-2 col-span-full md:col-span-1">
            <Inbox className="size-8 text-muted-foreground stroke-[1.2] mb-4" />
            <div className="text-lg font-medium">Unified inbox</div>
            <div className="text-muted-foreground">
              All your support channels in one place. No more switching between
              apps.
            </div>
          </div>
          <div className="border-y border-x min-h-48 flex flex-col px-4 py-6 gap-2 col-span-full md:col-span-1">
            <Zap className="size-8 text-muted-foreground stroke-[1.2] mb-4" />
            <div className="text-lg font-medium">Built for speed</div>
            <div className="text-muted-foreground">
              Realtime sync, no page loads, instant searches. FrontDesk doesn't
              make you wait.
            </div>
          </div>
          <div className="border-y min-h-48 flex flex-col px-4 py-6 gap-2 col-span-full md:col-span-1">
            <BookOpenText className="size-8 text-muted-foreground stroke-[1.2] mb-4" />
            <div className="text-lg font-medium">Public support</div>
            <div className="text-muted-foreground">
              Your support threads are public, indexable, and searchable.
              Customers can find answers without waiting for a response.
            </div>
          </div>
        </section>
        <HorizontalLine variant="outer" />
        <section
          id="pricing"
          className="col-span-full grid grid-cols-subgrid border-x border-b"
        >
          <div className="text-muted-foreground col-span-full font-mono uppercase pt-8 pb-4 px-4 border-b">
            02 - Pricing
          </div>
          <DashedPattern className="h-full border-r" />
          <div className="col-span-10 grid grid-cols-subgrid">
            <div className="text-center col-span-full h-fit flex flex-col items-center justify-center py-10 px-8">
              <div className="text-3xl font-bold mb-4">
                Simple pricing that scales with you
              </div>
              <div className="col-span-full text-center text-lg">
                Start today, no demo calls, no credit card required.
              </div>
            </div>
            <div className="md:col-span-3 col-span-full border-y py-6 px-4">
              <div className="text-lg font-medium">Hobby</div>
              <div className="mb-4">
                <span className="text-2xl font-semibold text-primary">$0</span>
                <span className="text-sm text-muted-foreground">
                  /seat/month
                </span>
              </div>
              <div className="mb-2 h-5" />
              <ul className="flex flex-col gap-2 [&>li]:relative [&>li]:pl-5 [&>li]:before:content-['✓'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:font-thin [&>li]:before:text-xs [&>li]:before:top-1/2 [&>li]:before:-translate-y-1/2">
                <li>Unlimited support tickets</li>
                <li>Unlimited customers</li>
                <li>Public support portal</li>
                <li>1 support channel</li>
              </ul>
            </div>
            <div className="md:col-span-7 col-span-full border-l border-y py-6 px-4">
              <div className="text-lg font-medium">Pro</div>
              <div className="mb-4">
                <span className="text-2xl font-semibold text-primary">$12</span>
                <span className="text-sm text-muted-foreground">
                  /seat/month
                </span>
              </div>
              <div className="text-muted-foreground text-sm mb-2 h-5">
                Everything in Hobby, plus:
              </div>
              <ul className="flex flex-col gap-2 [&>li]:relative [&>li]:pl-5 [&>li]:before:content-['✓'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:font-thin [&>li]:before:text-xs [&>li]:before:top-1/2 [&>li]:before:-translate-y-1/2">
                <li>Unlimited team members</li>
                <li>Unlimited support channels</li>
                <li>Custom domain for your support portal</li>
                <li>Priority support</li>
              </ul>
            </div>
            <div className="text-muted-foreground col-span-full font-mono uppercase pt-8 pb-4 px-4 border-b">
              FREQUENTLY ASKED QUESTIONS
            </div>
            <div className="col-span-full">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>
                    What makes FrontDesk different from other support tools?
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <p>
                      FrontDesk transforms your support conversations into a
                      public, searchable knowledge base. Every ticket you
                      resolve becomes a resource that future customers can find
                      through search engines, reducing repetitive questions and
                      improving your SEO.
                    </p>
                    <p>
                      FrontDesk is a modern support tool built for speed, not
                      complexity. We believe in simplicity, not bloat. Our
                      internal architecture is designed to be fast, with
                      realtime sync, instant feedback, zero page loads and even
                      offline support.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                {/* TODO: uncomment when migration is implemented - it's a good question but we don't have it yet */}
                {/* <AccordionItem value="item-2">
                  <AccordionTrigger>
                    Can I migrate my existing support tickets from another
                    platform?
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <p>
                      Yes! We provide migration tools to help you import your
                      existing support tickets, customer data, and conversation
                      history from popular platforms like Zendesk, Intercom, and
                      Help Scout.
                    </p>
                    <p>
                      Our team will work with you during the migration process
                      to ensure a smooth transition. All your historical data,
                      including attachments and metadata, will be preserved and
                      fully searchable in FrontDesk.
                    </p>
                  </AccordionContent>
                </AccordionItem> */}
                <AccordionItem value="item-3">
                  <AccordionTrigger>
                    How does the public support portal work?
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <p>
                      Your public support portal is where all users can see
                      previous support threads. Customers can search for
                      answers, browse by topic, and find solutions to common
                      problems without contacting support.
                    </p>
                    <p>
                      It also doubles as a free SEO tool for your business.
                      Since a lot of times potential customers are searching for
                      answers before they even know you exist, having a public
                      support portal helps them discover your business and feel
                      confident that you care about your customers needs.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-4">
                  <AccordionTrigger>
                    What support channels can I connect?
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <p>
                      FrontDesk aims to unify all your support channels in one
                      inbox. Currently, we only support Discord, with more
                      integrations including email, our built-in web widget,
                      Slack, Telegram, WhatsApp, and social media coming soon.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-5">
                  <AccordionTrigger>
                    Can I upgrade or downgrade my plan at any time?
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <p>
                      Absolutely! You can upgrade or downgrade your plan at any
                      time with no penalties or long-term commitments. Changes
                      take effect immediately, and we&apos;ll prorate any
                      billing adjustments.
                    </p>
                    <p>
                      Start with the free Hobby plan to explore FrontDesk, and
                      upgrade to Pro when you need more team members, multiple
                      support channels, or a custom domain. You can also
                      downgrade if your needs change, and all your data remains
                      intact.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                {/* TODO: uncomment when compliance is implemented - it's a good thing to have but we don't have it yet */}
                {/* <AccordionItem value="item-6">
                  <AccordionTrigger>
                    Is my customer data secure and private?
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-4 text-balance">
                    <p>
                      Security is our top priority. All data is encrypted in
                      transit and at rest using industry-standard encryption.
                      We&apos;re SOC 2 compliant and undergo regular security
                      audits to ensure your customer data is protected.
                    </p>
                    <p>
                      You maintain full ownership of your data and can export it
                      at any time. Our public portal only displays information
                      you choose to publish, and we automatically filter out
                      sensitive data like email addresses, phone numbers, and
                      payment information.
                    </p>
                  </AccordionContent>
                </AccordionItem> */}
              </Accordion>
            </div>
          </div>
          <DashedPattern className="h-full border-l" />
        </section>
        <HorizontalLine variant="outer" />
        <section
          className="col-span-full grid grid-cols-subgrid border-x border-b"
          id="engineering"
        >
          <div className="text-muted-foreground col-span-full font-mono uppercase pt-8 pb-4 px-4 border-b">
            03 - Engineering
          </div>
          <div className="col-span-full text-center pt-12 pb-6 px-4">
            <div className="text-2xl font-medium">Proudly open source</div>
            <a
              href="https://github.com/frontdeskhq/front-desk"
              className="text-lg text-muted-foreground hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Star us on GitHub
              <ArrowUpRight className="size-5 inline-block" />
            </a>
          </div>
          <div className="col-span-10 col-start-2 pb-12">
            <CommitHeatmap />
          </div>
        </section>
        <HorizontalLine variant="outer" />
        <section
          className="col-span-full grid grid-cols-subgrid border-x border-b relative"
          id="cta"
        >
          <DashedPattern className="absolute inset-0 -z-10 mask-radial-[80%_60%] md:mask-radial-[40%_50%] mask-radial-at-center mask-radial-from-60% mask-radial-from-transparent mask-radial-to-white" />
          {/* <DashedPattern className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_40%_50%_at_center,transparent_60%,black_100%)]" /> */}
          <div className="col-span-full text-center px-8 md:px-4 py-40">
            <div className="text-3xl font-medium mb-12">
              Join the future of customer support
            </div>
            <div className="flex gap-4 mx-auto max-w-md w-full flex-col md:flex-row">
              <Input
                placeholder="Enter your email..."
                className="w-full dark:bg-background/75"
              />
              <Button variant="default">Request access</Button>
            </div>
          </div>
        </section>
        <HorizontalLine variant="outer" />
        <footer className="col-span-full grid grid-cols-subgrid border-x">
          <div className="col-span-full border-b grid grid-cols-6 px-4 py-12">
            <div className="p-4 gap-4 col-span-full md:col-span-2 lg:pr-30 items-center flex flex-col md:items-start text-center md:text-start">
              <div className="flex gap-2">
                <Icon className="size-6" />{" "}
                <span className="text-base font-medium">FrontDesk</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Support your customers wherever they are.
              </div>
            </div>
            <div className="p-4 space-y-4 col-span-3 md:col-start-5 md:col-span-1">
              <div className="text-base font-medium">Connect</div>
              <div className="flex flex-col gap-2">
                <a
                  href="https://github.com/frontdeskhq/front-desk"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
                <a
                  href="https://x.com/frontdeskhq"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  X (Twitter)
                </a>
              </div>
            </div>
            <div className="p-4 space-y-4 col-span-3 md:col-start-6 md:col-span-1">
              <div className="text-base font-medium">Legal</div>
              <div className="flex flex-col gap-2">
                <a
                  href="https://github.com/frontdeskhq/front-desk"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                <a
                  href="https://x.com/frontdeskhq"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms of Service
                </a>
              </div>
            </div>
          </div>
          <div className="col-span-full text-center px-4 select-none text-muted-foreground/40">
            <svg
              width="100%"
              height="1.1em"
              viewBox="0 0 460 50"
              fill="none"
              style={{ fontSize: "calc(var(--spacing)*24)" }}
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>FrontDesk</title>
              <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontFamily="inherit"
                fontWeight="450"
                fontSize="48"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="1"
                style={{ letterSpacing: "-0.02em" }}
              >
                FrontDesk
              </text>
            </svg>
          </div>
        </footer>
      </main>
    </div>
  );
}
