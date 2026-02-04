import { Check, Eye, Search } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

const allThreads = [
  { title: "How to set up webhooks", views: 234 },
  { title: "Webhook retry policies", views: 156 },
  { title: "Authentication with OAuth", views: 312 },
  { title: "Auth token best practices", views: 145 },
  { title: "API rate limiting guide", views: 189 },
  { title: "REST API versioning", views: 203 },
  { title: "Custom email templates", views: 178 },
  { title: "Email notification settings", views: 134 },
  { title: "Managing team members", views: 167 },
  { title: "Team role permissions", views: 142 },
];

const searchCases = ["webhook", "auth", "API", "email", "team"];
const sortedThreads = [...allThreads].sort((a, b) => b.views - a.views);

export function PortalVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  const [displayedText, setDisplayedText] = useState("");
  const [caseIndex, setCaseIndex] = useState(0);
  const [phase, setPhase] = useState<
    "idle" | "typing" | "waiting" | "clearing"
  >("idle");

  const filteredThreads = (
    displayedText
      ? allThreads
          .filter((t) =>
            t.title.toLowerCase().includes(displayedText.toLowerCase()),
          )
          .sort((a, b) => b.views - a.views)
      : sortedThreads
  ).slice(0, 3);

  useEffect(() => {
    if (!isInView) return;

    const currentQuery = searchCases[caseIndex];

    if (phase === "idle") {
      const timeout = setTimeout(() => setPhase("typing"), 5000);
      return () => clearTimeout(timeout);
    }

    if (phase === "typing") {
      if (displayedText.length < currentQuery.length) {
        const timeout = setTimeout(
          () =>
            setDisplayedText(currentQuery.slice(0, displayedText.length + 1)),
          80 + Math.random() * 60,
        );
        return () => clearTimeout(timeout);
      }
      setPhase("waiting");
      return;
    }

    if (phase === "waiting") {
      const timeout = setTimeout(() => setPhase("clearing"), 5000);
      return () => clearTimeout(timeout);
    }

    if (phase === "clearing") {
      if (displayedText.length > 0) {
        const timeout = setTimeout(
          () => setDisplayedText(displayedText.slice(0, -1)),
          30,
        );
        return () => clearTimeout(timeout);
      }
      setCaseIndex((prev) => (prev + 1) % searchCases.length);
      setPhase("idle");
    }
  }, [isInView, phase, displayedText, caseIndex]);

  return (
    <div ref={ref} className="w-full max-w-xs flex flex-col gap-3 py-4">
      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={
          isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined
        }
        transition={{ duration: 0.4 }}
        className="flex items-center gap-2 rounded-lg border bg-background-primary px-3 py-2 shadow-sm"
      >
        <Search className="size-4 text-foreground-secondary shrink-0" />
        <div className="text-sm flex items-center min-w-0">
          {displayedText ? (
            <span className="text-foreground truncate">{displayedText}</span>
          ) : (
            <span className="text-foreground-secondary/60">
              Search threads...
            </span>
          )}
          {isInView && displayedText && (
            <motion.span
              className="inline-block w-[2px] h-4 bg-foreground/70 shrink-0 ml-px"
              animate={{ opacity: [1, 0] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            />
          )}
        </div>
      </motion.div>

      {/* Thread rows */}
      <div className="flex flex-col gap-3 h-37.5">
        <AnimatePresence mode="popLayout">
          {filteredThreads.map((thread, index) => (
            <motion.div
              // biome-ignore lint/suspicious/noArrayIndexKey: this is a visual component
              key={index}
              layout
              initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-between rounded-lg border bg-background-primary px-3 py-2.5 shadow-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Check className="size-3.5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium truncate">
                  {thread.title}
                </span>
              </div>
              <div className="flex items-center gap-1 text-foreground-secondary shrink-0 ml-2">
                <Eye className="size-3" />
                <span className="text-xs">{thread.views}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
