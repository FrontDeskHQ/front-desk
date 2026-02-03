import { Discord } from "@workspace/ui/components/icons";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const resultCards = [
  {
    label: "Similar threads",
    value: '"Webhook setup" · 94% match',
    color: "text-blue-500",
  },
  {
    label: "Labels",
    value: "#integrations  #how-to",
    color: "text-purple-500",
  },
  {
    label: "Status",
    value: "Waiting on support",
    color: "text-amber-500",
  },
  {
    label: "Duplicates",
    value: "No duplicates found",
    color: "text-emerald-500",
  },
];

export function AiTriageVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <div ref={ref} className="w-full flex items-center justify-center gap-4 md:gap-8 py-4">
      {/* Thread card */}
      <motion.div
        initial={{ opacity: 0, x: -20, filter: "blur(8px)" }}
        animate={
          isInView
            ? { opacity: 1, x: 0, filter: "blur(0px)" }
            : undefined
        }
        transition={{ duration: 0.5 }}
        className="shrink-0 w-48 md:w-56 rounded-lg border bg-background-primary p-3 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-2">
          <Discord className="size-4 text-foreground-secondary" />
          <span className="text-xs text-foreground-secondary">Discord</span>
        </div>
        <div className="text-sm font-medium leading-snug mb-1">
          "How do I set up webhooks?"
        </div>
        <div className="text-xs text-foreground-secondary">@user</div>
      </motion.div>

      {/* SVG arrows */}
      <svg
        viewBox="0 0 60 120"
        className="w-8 md:w-12 h-28 md:h-32 shrink-0"
        fill="none"
      >
        {[0, 1, 2, 3].map((i) => {
          const startY = 60;
          const endY = 15 + i * 30;
          return (
            <motion.path
              key={i}
              d={`M 0 ${startY} C 30 ${startY}, 30 ${endY}, 60 ${endY}`}
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-foreground-secondary/40"
              initial={{ pathLength: 0 }}
              animate={isInView ? { pathLength: 1 } : undefined}
              transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
            />
          );
        })}
      </svg>

      {/* Result cards */}
      <div className="flex flex-col gap-2 shrink-0">
        {resultCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, x: 10, filter: "blur(8px)" }}
            animate={
              isInView
                ? { opacity: 1, x: 0, filter: "blur(0px)" }
                : undefined
            }
            transition={{ duration: 0.4, delay: 0.9 + i * 0.12 }}
            className="rounded-md border bg-background-primary px-3 py-1.5 shadow-sm"
          >
            <div className={`text-[10px] font-medium uppercase tracking-wider ${card.color}`}>
              {card.label}
            </div>
            <div className="text-xs text-foreground-secondary">{card.value}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
