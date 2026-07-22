import type { Variants } from "motion/react";

export const blurSlideContainerVariants: Variants = {
  visible: {
    transition: {
      delayChildren: 0.2,
      staggerChildren: 0.05,
    },
  },
};

export const blurSlideItemVariants: Variants = {
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
};
