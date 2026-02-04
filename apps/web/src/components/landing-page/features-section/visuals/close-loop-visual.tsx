import { Linear } from "@workspace/ui/components/icons";
import { StatusIndicator } from "@workspace/ui/components/indicator";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

function ConnectorArrow({
  delay,
  isInView,
  id,
}: {
  delay: number;
  isInView: boolean;
  id: string;
}) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: this is a visual component
    <motion.svg
      viewBox="0 0 48 16"
      fill="none"
      className="shrink-0 w-8 md:w-12 self-center text-foreground-secondary"
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : undefined}
      transition={{ duration: 0.3, delay }}
    >
      <defs>
        <clipPath id={`arrow-clip-${id}`}>
          <rect x="0" y="5" width="40" height="6" />
        </clipPath>
      </defs>
      {/* Base line */}
      <line
        x1="0"
        y1="8"
        x2="40"
        y2="8"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1.5"
      />
      {/* Shimmer highlight */}
      <motion.rect
        x={-10}
        y="6.75"
        width="10"
        height="2.5"
        rx="1.25"
        fill="currentColor"
        fillOpacity="0.35"
        clipPath={`url(#arrow-clip-${id})`}
        animate={isInView ? { x: [-10, 48] } : undefined}
        transition={{
          duration: 1.8,
          delay: delay + 0.5,
          repeat: Infinity,
          repeatDelay: 2,
          ease: "linear",
        }}
      />
      {/* Arrowhead */}
      <path d="M38 4 L46 8 L38 12" fill="currentColor" fillOpacity="0.25" />
    </motion.svg>
  );
}

export function CloseLoopVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <div
      ref={ref}
      className="w-full flex items-center justify-center py-4 md:scale-100 scale-75"
    >
      {/* Stage 1: Thread */}
      <motion.div
        initial={{ opacity: 0, x: -15, filter: "blur(8px)" }}
        animate={
          isInView ? { opacity: 1, x: 0, filter: "blur(0px)" } : undefined
        }
        transition={{ duration: 0.4 }}
        className="shrink-0 rounded-lg border bg-background-primary p-3 shadow-sm w-36 md:w-44"
      >
        <div className="text-xs text-foreground-secondary mb-1">Thread</div>
        <div className="text-sm font-medium mb-1.5">"Safari bug"</div>
        <div className="flex items-center gap-1.5">
          <StatusIndicator status={1} className="size-3" />
          <span className="text-xs font-medium">In Progress</span>
        </div>
      </motion.div>

      {/* Arrow 1 */}
      <ConnectorArrow delay={0.5} isInView={isInView} id="1" />

      {/* Stage 2: Linear ticket */}
      <motion.div
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={
          isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined
        }
        transition={{ duration: 0.4, delay: 0.6 }}
        className="shrink-0 rounded-lg border bg-background-primary p-3 shadow-sm w-36 md:w-44"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Linear className="size-3 text-foreground-secondary" />
          <span className="text-xs text-foreground-secondary">Linear</span>
        </div>
        <div className="text-sm font-medium mb-1.5">FRO-234</div>
        <div className="flex items-center gap-1.5">
          <StatusIndicator status={2} className="size-3 text-[#5e6ad2]!" />
          <span className="text-xs font-medium">Done</span>
        </div>
      </motion.div>

      {/* Arrow 2 */}
      <ConnectorArrow delay={1.1} isInView={isInView} id="2" />

      {/* Stage 3: Resolved */}
      <motion.div
        initial={{ opacity: 0, x: 15, filter: "blur(8px)" }}
        animate={
          isInView ? { opacity: 1, x: 0, filter: "blur(0px)" } : undefined
        }
        transition={{ duration: 0.4, delay: 1.2 }}
        className="shrink-0 rounded-lg border bg-background-primary p-3 shadow-sm w-36 md:w-44"
      >
        <div className="text-xs text-foreground-secondary mb-1">Thread</div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <StatusIndicator status={2} className="size-3 text-[#5e6ad2]" />
          <span className="text-sm font-medium">Resolved</span>
        </div>
        <div className="text-xs text-foreground-secondary">User notified</div>
      </motion.div>
    </div>
  );
}
