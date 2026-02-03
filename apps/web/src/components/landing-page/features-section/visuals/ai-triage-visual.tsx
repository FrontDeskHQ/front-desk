import { Avatar } from "@workspace/ui/components/avatar";
import { Discord, GitHub, Slack } from "@workspace/ui/components/icons";
import {
  StatusIndicator,
  statusValues,
} from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { cn } from "@workspace/ui/lib/utils";
import { Mail } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useEffect,
  useRef,
  useState,
} from "react";

type MockThread = {
  name: string;
  author: string;
};

type ThreadData = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  channel: string;
  question: string;
  user: string;
  results: {
    similarThreads: (MockThread & { match: number })[];
    labels: { name: string; color: string }[];
    status: number;
    duplicateThreads: MockThread[];
  };
};

const threads: ThreadData[] = [
  {
    icon: Discord,
    channel: "Discord",
    question: "How do I set up webhooks?",
    user: "@daniel",
    results: {
      similarThreads: [
        { name: "Webhook setup guide", author: "Sarah", match: 94 },
        { name: "Setting up integrations", author: "Tom", match: 81 },
        { name: "API webhook config", author: "Amy", match: 72 },
        { name: "Discord bot webhooks", author: "Sam", match: 68 },
        { name: "Webhook troubleshooting", author: "Lee", match: 61 },
      ],
      labels: [
        { name: "integrations", color: "#8b5cf6" },
        { name: "how-to", color: "#3b82f6" },
      ],
      status: 1,
      duplicateThreads: [],
    },
  },
  {
    icon: Slack,
    channel: "Slack",
    question: "Our billing page shows the wrong plan",
    user: "@maria",
    results: {
      similarThreads: [
        { name: "Billing display bug", author: "Tom", match: 87 },
        { name: "Plan not updating", author: "Rex", match: 76 },
        { name: "Subscription page error", author: "Zoe", match: 71 },
        { name: "Wrong pricing shown", author: "Pat", match: 65 },
        { name: "Billing plan mismatch", author: "Alex", match: 59 },
      ],
      labels: [
        { name: "billing", color: "#f59e0b" },
        { name: "bug-report", color: "#ef4444" },
      ],
      status: 0,
      duplicateThreads: [{ name: "Wrong plan shown", author: "Li" }],
    },
  },
  {
    icon: GitHub,
    channel: "GitHub",
    question: "API returns 429 after only 10 requests",
    user: "@jake",
    results: {
      similarThreads: [
        { name: "Rate limit errors", author: "Amy", match: 91 },
        { name: "429 too many requests", author: "Jon", match: 88 },
        { name: "API throttle FAQ", author: "Kim", match: 69 },
        { name: "Request limit exceeded", author: "Max", match: 64 },
        { name: "API quota issues", author: "Nina", match: 57 },
      ],
      labels: [
        { name: "api", color: "#06b6d4" },
        { name: "rate-limiting", color: "#f97316" },
      ],
      status: 1,
      duplicateThreads: [{ name: "429 on batch calls", author: "Rex" }],
    },
  },
  {
    icon: Mail,
    channel: "Email",
    question: "Can we get SSO for our team?",
    user: "alex@acme.co",
    results: {
      similarThreads: [
        { name: "SSO enterprise setup", author: "Kim", match: 78 },
        { name: "SAML config guide", author: "Dev", match: 71 },
        { name: "Team auth options", author: "Mia", match: 64 },
        { name: "Okta integration", author: "Raj", match: 58 },
        { name: "Single sign-on request", author: "Tara", match: 52 },
      ],
      labels: [
        { name: "enterprise", color: "#8b5cf6" },
        { name: "feature-request", color: "#10b981" },
      ],
      status: 0,
      duplicateThreads: [],
    },
  },
  {
    icon: Discord,
    channel: "Discord",
    question: "Notifications stopped working on mobile",
    user: "@priya",
    results: {
      similarThreads: [
        { name: "Mobile push broken", author: "Jon", match: 82 },
        { name: "iOS alerts missing", author: "Eli", match: 74 },
        { name: "Android notifications", author: "Rio", match: 68 },
        { name: "Push not working", author: "Kai", match: 61 },
        { name: "Mobile alerts issue", author: "Luna", match: 55 },
      ],
      labels: [
        { name: "mobile", color: "#3b82f6" },
        { name: "bug-report", color: "#ef4444" },
      ],
      status: 0,
      duplicateThreads: [],
    },
  },
];

const CYCLE_INTERVAL = 7500;

const slideBlurFade = {
  initial: { opacity: 0, y: 6, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -6, filter: "blur(4px)" },
};

function MockThreadChip({ name, author }: MockThread) {
  return (
    <div className="border flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 text-xs bg-foreground-tertiary/15">
      <Avatar variant="user" size="sm" fallback={author} />
      <span className="truncate">{name}</span>
    </div>
  );
}

type ResultCardProps = {
  heading: string;
  children: ReactNode;
  index: number;
  isInView: boolean;
  className?: string;
};

function ResultCard({
  heading,
  children,
  index,
  isInView,
  className,
}: ResultCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10, filter: "blur(8px)" }}
      animate={isInView ? { opacity: 1, x: 0, filter: "blur(0px)" } : undefined}
      transition={{ duration: 0.4, delay: 0.9 + index * 0.12 }}
      className={cn(
        "relative w-48 md:w-56 rounded-md border bg-background-primary px-3 pb-1.5 pt-6 shadow-sm",
        className,
      )}
    >
      <div className="top-1.5 left-3 absolute text-[10px] font-medium uppercase tracking-wider text-foreground-secondary mb-1">
        {heading}
      </div>
      <div className="flex flex-col justify-center overflow-hidden absolute inset-x-3 top-6 bottom-1.5">
        {children}
      </div>
    </motion.div>
  );
}

export function AiTriageVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });
  const [activeIndex, setActiveIndex] = useState(0);
  const [shimmerKey, setShimmerKey] = useState(0);
  const [resultsVisible, setResultsVisible] = useState(true);
  const [hasEnteredView, setHasEnteredView] = useState(false);

  useEffect(() => {
    if (isInView && !hasEnteredView) {
      const timeout = setTimeout(() => setHasEnteredView(true), 1500);
      return () => clearTimeout(timeout);
    }
  }, [isInView, hasEnteredView]);

  useEffect(() => {
    if (!hasEnteredView) return;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      // Step 1: new thread + exit old results
      setResultsVisible(false);
      setActiveIndex((prev) => (prev + 1) % threads.length);
      // Step 2: shimmer paths after thread enters
      t1 = setTimeout(() => setShimmerKey((k) => k + 1), 500);
      // Step 3: show new results after paths draw
      t2 = setTimeout(() => setResultsVisible(true), 1000);
    }, CYCLE_INTERVAL);
    return () => {
      clearInterval(interval);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [hasEnteredView]);

  const thread = threads[activeIndex];
  const Icon = thread.icon;
  const { results } = thread;
  const statusLabel = statusValues[results.status]?.label ?? "Open";

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center gap-4 px-4 w-[140%] max-w-3xl max-h-96 overflow-hidden lg:ml-48 md:scale-100 md:max-w-2xl scale-75 md:w-full"
    >
      {/* Thread card */}
      <motion.div
        initial={{ opacity: 0, x: -20, filter: "blur(8px)" }}
        animate={
          isInView ? { opacity: 1, x: 0, filter: "blur(0px)" } : undefined
        }
        transition={{ duration: 0.5 }}
        className="shrink-0 w-48 md:w-56 h-27 rounded-lg border bg-background-primary p-3 shadow-sm"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={hasEnteredView ? slideBlurFade.initial : false}
            animate={slideBlurFade.animate}
            exit={slideBlurFade.exit}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="size-4 text-foreground-secondary" />
              <span className="text-xs text-foreground-secondary">
                {thread.channel}
              </span>
            </div>
            <div className="text-sm font-medium leading-snug mb-1">
              "{thread.question}"
            </div>
            <div className="text-xs text-foreground-secondary">
              {thread.user}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* SVG arrows */}
      <div className="grow shrink min-w-0 self-stretch py-10">
        {/** biome-ignore lint/a11y/noSvgWithoutTitle: this is a visual component */}
        <svg
          viewBox="0 0 60 120"
          className="w-full h-full"
          fill="none"
          preserveAspectRatio="none"
        >
          <defs>
            <filter
              id="shimmer-glow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="1.5"
                result="blur"
              />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Base paths — draw once on first view, then stay static */}
          {[20, 55, 80, 110].map((endY, i) => {
            const startY = 60;
            return (
              <motion.path
                key={`base-${
                  // biome-ignore lint/suspicious/noArrayIndexKey: this is a visual component
                  i
                }`}
                d={`M 0 ${startY} C 30 ${startY}, 30 ${endY}, 60 ${endY}`}
                stroke="currentColor"
                strokeWidth="1"
                className="text-foreground-secondary/40 md:stroke-[0.5]"
                initial={{ pathLength: 0 }}
                animate={isInView ? { pathLength: 1 } : undefined}
                transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
              />
            );
          })}
          {/* Shimmer overlay — travels along each path on cycle */}
          {shimmerKey > 0 &&
            [20, 55, 80, 110].map((endY, i) => {
              const startY = 60;
              return (
                <motion.path
                  key={`shimmer-${shimmerKey}-${
                    // biome-ignore lint/suspicious/noArrayIndexKey: this is a visual component
                    i
                  }`}
                  d={`M 0 ${startY} C 30 ${startY}, 30 ${endY}, 60 ${endY}`}
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-foreground-secondary md:stroke-1"
                  filter="url(#shimmer-glow)"
                  initial={{ pathLength: 0.15, pathOffset: 0, opacity: 0.5 }}
                  animate={{ pathOffset: 1.15, opacity: 0 }}
                  transition={{
                    pathOffset: {
                      duration: 0.6,
                      delay: i * 0.08,
                      ease: "easeInOut",
                    },
                    opacity: {
                      duration: 0.15,
                      delay: i * 0.08 + 0.45,
                    },
                  }}
                />
              );
            })}
        </svg>
      </div>

      {/* Result cards */}
      <div className="flex flex-col shrink-0 self-stretch py-10 gap-4">
        {/* Similar threads */}
        <ResultCard
          heading="Similar threads"
          index={0}
          isInView={isInView}
          className="h-24"
        >
          <div
            className="max-h-18 overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to bottom, black 0%, black 91.67%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 0%, black 91.67%, transparent 100%)",
            }}
          >
            <AnimatePresence mode="wait">
              {resultsVisible && (
                <motion.div
                  key={`${activeIndex}-similar`}
                  className="flex flex-col gap-1"
                  initial={hasEnteredView ? slideBlurFade.initial : false}
                  animate={slideBlurFade.animate}
                  exit={slideBlurFade.exit}
                  transition={{ duration: 0.25 }}
                >
                  {results.similarThreads.map((t) => (
                    <div key={t.name} className="flex items-center gap-2">
                      <MockThreadChip name={t.name} author={t.author} />
                      <span className="text-[10px] font-medium text-foreground-secondary shrink-0">
                        {t.match}%
                      </span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ResultCard>

        {/* Labels */}
        <ResultCard
          heading="Labels"
          index={1}
          isInView={isInView}
          className="h-13.5 overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {resultsVisible && (
              <motion.div
                key={`${activeIndex}-labels`}
                className="flex items-center gap-1.5"
                initial={hasEnteredView ? slideBlurFade.initial : false}
                animate={slideBlurFade.animate}
                exit={slideBlurFade.exit}
                transition={{ duration: 0.25, delay: 0.05 }}
              >
                {results.labels.map((label) => (
                  <LabelBadge
                    key={label.name}
                    name={label.name}
                    color={label.color}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </ResultCard>

        {/* Status */}
        <ResultCard
          heading="Status"
          index={2}
          isInView={isInView}
          className="h-13.5 overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {resultsVisible && (
              <motion.div
                key={`${activeIndex}-status`}
                className="flex items-center gap-1.5"
                initial={hasEnteredView ? slideBlurFade.initial : false}
                animate={slideBlurFade.animate}
                exit={slideBlurFade.exit}
                transition={{ duration: 0.25, delay: 0.1 }}
              >
                <StatusIndicator status={results.status} />
                <span className="text-xs font-medium">{statusLabel}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </ResultCard>

        {/* Duplicates */}
        <ResultCard
          heading="Duplicates"
          index={3}
          isInView={isInView}
          className="h-14.5 overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {resultsVisible && (
              <motion.div
                key={`${activeIndex}-dupes`}
                className="flex items-center gap-1.5"
                initial={hasEnteredView ? slideBlurFade.initial : false}
                animate={slideBlurFade.animate}
                exit={slideBlurFade.exit}
                transition={{ duration: 0.25, delay: 0.15 }}
              >
                {results.duplicateThreads.length === 0 ? (
                  <span className="text-xs text-foreground-primary font-medium">
                    No duplicates found
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {results.duplicateThreads.map((t) => (
                      <MockThreadChip
                        key={t.name}
                        name={t.name}
                        author={t.author}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </ResultCard>
      </div>
    </div>
  );
}
