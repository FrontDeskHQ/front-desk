import { Linear } from "@workspace/ui/components/icons";
import { ArrowRight, Check, CircleDot } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

export function CloseLoopVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <div ref={ref} className="w-full flex items-center justify-center gap-2 md:gap-4 py-4">
      {/* Stage 1: Thread */}
      <motion.div
        initial={{ opacity: 0, x: -15, filter: "blur(8px)" }}
        animate={
          isInView
            ? { opacity: 1, x: 0, filter: "blur(0px)" }
            : undefined
        }
        transition={{ duration: 0.4 }}
        className="shrink-0 rounded-lg border bg-background-primary p-3 shadow-sm w-36 md:w-44"
      >
        <div className="text-xs text-foreground-secondary mb-1">Thread</div>
        <div className="text-sm font-medium mb-1.5">"Safari bug"</div>
        <div className="flex items-center gap-1.5">
          <CircleDot className="size-3 text-amber-500" />
          <span className="text-xs text-amber-500 font-medium">In Progress</span>
        </div>
      </motion.div>

      {/* Arrow 1 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={
          isInView
            ? { opacity: 1, scale: 1 }
            : undefined
        }
        transition={{ duration: 0.3, delay: 0.5 }}
      >
        <ArrowRight className="size-4 text-foreground-secondary/40" />
      </motion.div>

      {/* Stage 2: Linear ticket */}
      <motion.div
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={
          isInView
            ? { opacity: 1, y: 0, filter: "blur(0px)" }
            : undefined
        }
        transition={{ duration: 0.4, delay: 0.6 }}
        className="shrink-0 rounded-lg border bg-background-primary p-3 shadow-sm w-36 md:w-44"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Linear className="size-3 text-foreground-secondary" />
          <span className="text-xs text-foreground-secondary">Linear</span>
        </div>
        <div className="text-sm font-medium mb-1.5">#FD-234</div>
        <div className="flex items-center gap-1.5">
          <Check className="size-3 text-emerald-500" />
          <span className="text-xs text-emerald-500 font-medium">Done</span>
        </div>
      </motion.div>

      {/* Arrow 2 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={
          isInView
            ? { opacity: 1, scale: 1 }
            : undefined
        }
        transition={{ duration: 0.3, delay: 1.1 }}
      >
        <ArrowRight className="size-4 text-foreground-secondary/40" />
      </motion.div>

      {/* Stage 3: Resolved */}
      <motion.div
        initial={{ opacity: 0, x: 15, filter: "blur(8px)" }}
        animate={
          isInView
            ? { opacity: 1, x: 0, filter: "blur(0px)" }
            : undefined
        }
        transition={{ duration: 0.4, delay: 1.2 }}
        className="shrink-0 rounded-lg border bg-background-primary p-3 shadow-sm w-36 md:w-44"
      >
        <div className="text-xs text-foreground-secondary mb-1">Thread</div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Check className="size-3 text-emerald-500" />
          <span className="text-sm font-medium text-emerald-500">Resolved</span>
        </div>
        <div className="text-xs text-foreground-secondary">User notified</div>
      </motion.div>
    </div>
  );
}
