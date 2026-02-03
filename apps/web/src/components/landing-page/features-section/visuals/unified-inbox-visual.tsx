import { Discord, GitHub, Slack } from "@workspace/ui/components/icons";
import { Inbox, Mail } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const channels = [
  { icon: Discord, label: "Discord" },
  { icon: Slack, label: "Slack" },
  { icon: GitHub, label: "GitHub" },
  { icon: Mail, label: "Email" },
];

export function UnifiedInboxVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <div ref={ref} className="w-full flex items-center justify-center gap-4 md:gap-8 py-4">
      {/* Channel icons */}
      <div className="flex flex-col gap-3 shrink-0">
        {channels.map((channel, i) => {
          const Icon = channel.icon;
          return (
            <motion.div
              key={channel.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={
                isInView
                  ? { opacity: 1, scale: 1 }
                  : undefined
              }
              transition={{ duration: 0.3, delay: i * 0.1 }}
              className="size-10 rounded-lg border bg-background-primary flex items-center justify-center shadow-sm"
            >
              <Icon className="size-5 text-foreground-secondary" />
            </motion.div>
          );
        })}
      </div>

      {/* SVG connecting lines */}
      <svg
        viewBox="0 0 60 130"
        className="w-8 md:w-12 h-32 shrink-0"
        fill="none"
      >
        {[0, 1, 2, 3].map((i) => {
          const startY = 16 + i * 33;
          const endY = 65;
          return (
            <motion.path
              key={i}
              d={`M 0 ${startY} C 30 ${startY}, 30 ${endY}, 60 ${endY}`}
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-foreground-secondary/40"
              initial={{ pathLength: 0 }}
              animate={isInView ? { pathLength: 1 } : undefined}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
            />
          );
        })}
      </svg>

      {/* Inbox */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={
          isInView
            ? { opacity: 1, scale: 1 }
            : undefined
        }
        transition={{ duration: 0.4, delay: 1 }}
        className="shrink-0 rounded-lg border bg-background-primary p-4 shadow-sm flex flex-col items-center gap-2"
      >
        <div className="relative">
          <Inbox className="size-8 text-foreground-secondary stroke-[1.2]" />
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : undefined}
            transition={{ type: "spring", bounce: 0.5, delay: 1.3 }}
            className="absolute -top-2 -right-2 size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center"
          >
            4
          </motion.div>
        </div>
        <span className="text-xs font-medium">Inbox</span>
      </motion.div>
    </div>
  );
}
