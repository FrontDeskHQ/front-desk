import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

type FeatureCardProps = {
  variant: "primary" | "half" | "secondary";
  title: string;
  body: string;
  visual: ReactNode;
  className?: string;
};

export function FeatureCard({
  variant,
  title,
  body,
  visual,
  className,
}: FeatureCardProps) {
  if (variant === "primary") {
    return (
      <div
        className={cn(
          "col-span-full flex flex-col bg-background relative",
          className,
        )}
      >
        <div className="px-6 py-6 md:px-8 lg:absolute pb-0!">
          <h3 className="text-xl font-semibold mb-2">{title}</h3>
          <p className="text-foreground-secondary leading-relaxed max-w-xl">
            {body}
          </p>
        </div>
        <div className="min-h-48 flex items-center justify-center p-4 lg:pt-12 md:p-6 overflow-hidden">
          {visual}
        </div>
      </div>
    );
  }

  if (variant === "secondary") {
    return (
      <div
        className={cn(
          "col-span-full flex flex-col lg:flex-row bg-background",
          className,
        )}
      >
        <div className="lg:w-2/5 px-6 py-6 lg:px-8 flex flex-col justify-center">
          <h3 className="text-xl font-semibold mb-2">{title}</h3>
          <p className="text-foreground-secondary leading-relaxed max-w-xl">
            {body}
          </p>
        </div>
        <div className="flex-1 min-h-48 flex items-center justify-center p-6 lg:p-8 overflow-hidden">
          {visual}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "col-span-full md:col-span-1 flex flex-col md:flex-row bg-background",
        className,
      )}
    >
      <div className="md:w-2/5 px-6 py-6 md:px-8 flex flex-col justify-center">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-foreground-secondary leading-relaxed">{body}</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 md:p-8 overflow-hidden">
        {visual}
      </div>
    </div>
  );
}
