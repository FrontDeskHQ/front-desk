import { cn } from "@workspace/ui/lib/utils";
import { LoaderIcon } from "lucide-react";

export const Spinner = ({ className }: { className?: string }) => (
  <LoaderIcon className={cn("animate-spin", className)} />
);
