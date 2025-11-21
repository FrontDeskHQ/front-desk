import type { ReactNode } from "react";
import { getProseStyles } from "../lib/tiptap";
import { cn } from "../lib/utils";

interface ProseProps {
  children: ReactNode;
  className?: string;
}

export function Prose({ children, className }: ProseProps) {
  return <div className={cn(getProseStyles(), className)}>{children}</div>;
}
