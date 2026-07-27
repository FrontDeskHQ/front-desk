import { motion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import useMeasure from "react-use-measure";

import { cn } from "../lib/utils";

type PresetType =
  | "fade"
  | "slide"
  | "scale"
  | "blur"
  | "blur-slide"
  | "zoom"
  | "flip"
  | "bounce"
  | "rotate"
  | "swing";

interface AnimatedGroupProps {
  children: ReactNode;
  className?: string;
  variants?: {
    container?: Variants;
    item?: Variants;
  };
  preset?: PresetType;
}

const defaultContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const defaultItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const presetVariants: Record<
  PresetType,
  { container: Variants; item: Variants }
> = {
  blur: {
    container: defaultContainerVariants,
    item: {
      hidden: { filter: "blur(4px)", opacity: 0 },
      visible: { filter: "blur(0px)", opacity: 1 },
    },
  },
  "blur-slide": {
    container: {
      visible: {
        transition: {
          delayChildren: 0.3,
          staggerChildren: 0.05,
        },
      },
    },
    item: {
      hidden: {
        filter: "blur(12px)",
        opacity: 0,
        y: 12,
      },
      visible: {
        filter: "blur(0px)",
        opacity: 1,
        transition: {
          bounce: 0.3,
          duration: 1.5,
          type: "spring",
        },
        y: 0,
      },
    },
  },
  bounce: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, y: -50 },
      visible: {
        opacity: 1,
        transition: { damping: 10, stiffness: 400, type: "spring" },
        y: 0,
      },
    },
  },
  fade: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    },
  },
  flip: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, rotateX: -90 },
      visible: {
        opacity: 1,
        rotateX: 0,
        transition: { damping: 20, stiffness: 300, type: "spring" },
      },
    },
  },
  rotate: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, rotate: -180 },
      visible: {
        opacity: 1,
        rotate: 0,
        transition: { damping: 15, stiffness: 200, type: "spring" },
      },
    },
  },
  scale: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, scale: 0.8 },
      visible: { opacity: 1, scale: 1 },
    },
  },
  slide: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    },
  },
  swing: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, rotate: -10 },
      visible: {
        opacity: 1,
        rotate: 0,
        transition: { damping: 8, stiffness: 300, type: "spring" },
      },
    },
  },
  zoom: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, scale: 0.5 },
      visible: {
        opacity: 1,
        scale: 1,
        transition: { damping: 20, stiffness: 300, type: "spring" },
      },
    },
  },
};

function AnimatedGroup({
  children,
  className,
  variants,
  preset,
}: AnimatedGroupProps) {
  const selectedVariants = preset
    ? presetVariants[preset]
    : { container: defaultContainerVariants, item: defaultItemVariants };
  const containerVariants = variants?.container || selectedVariants.container;
  const itemVariants = variants?.item || selectedVariants.item;

  const childItems = Array.isArray(children)
    ? children
    : children
      ? [children]
      : [];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={cn(className)}
    >
      {childItems.map((child, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: it's ok
        <motion.div key={index} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

function AutoResizableBoxRoot({
  children,
  className,
  transition,
  ...props
}: {
  children: ReactNode;
  className?: string;
  transition?: Transition;
} & Omit<
  ComponentProps<"div">,
  | "children"
  | "className"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
>) {
  const [ref, bounds] = useMeasure();

  return (
    <motion.div
      animate={{
        height: bounds.height > 0 ? bounds.height : undefined,
      }}
      transition={
        transition ?? { duration: 0.15, ease: "easeInOut", type: "tween" }
      }
      className="overflow-hidden"
      {...props}
    >
      <div ref={ref} className={className}>
        {children}
      </div>
    </motion.div>
  );
}

function AutoResizableBoxContent({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

const AutoResizableBox = {
  Content: AutoResizableBoxContent,
  Root: AutoResizableBoxRoot,
};

export { AnimatedGroup, AutoResizableBox };
