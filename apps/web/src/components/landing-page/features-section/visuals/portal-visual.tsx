import { Check, Eye, Search } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const threads = [
  { title: "How to set up webhooks", views: 234 },
  { title: "Rate limiting explained", views: 189 },
];

export function PortalVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <div ref={ref} className="w-full max-w-xs flex flex-col gap-3 py-4">
      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={
          isInView
            ? { opacity: 1, y: 0, filter: "blur(0px)" }
            : undefined
        }
        transition={{ duration: 0.4 }}
        className="flex items-center gap-2 rounded-lg border bg-background-primary px-3 py-2 shadow-sm"
      >
        <Search className="size-4 text-foreground-secondary" />
        <span className="text-sm text-foreground-secondary/60">
          Search threads...
        </span>
      </motion.div>

      {/* Thread rows */}
      {threads.map((thread, i) => (
        <motion.div
          key={thread.title}
          initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
          animate={
            isInView
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : undefined
          }
          transition={{ duration: 0.4, delay: 0.4 + i * 0.15 }}
          className="flex items-center justify-between rounded-lg border bg-background-primary px-3 py-2.5 shadow-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Check className="size-3.5 text-emerald-500 shrink-0" />
            <span className="text-sm font-medium truncate">{thread.title}</span>
          </div>
          <div className="flex items-center gap-1 text-foreground-secondary shrink-0 ml-2">
            <Eye className="size-3" />
            <motion.span
              className="text-xs"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : undefined}
              transition={{ duration: 0.3, delay: 0.8 + i * 0.15 }}
            >
              {thread.views}
            </motion.span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
