import type { ReactNode } from "react";

type FeatureCardProps = {
  variant: "full" | "half";
  title: string;
  body: string;
  visual: ReactNode;
};

export function FeatureCard({ variant, title, body, visual }: FeatureCardProps) {
  if (variant === "full") {
    return (
      <div className="col-span-full flex flex-col border-b bg-background">
        <div className="min-h-48 flex items-center justify-center p-6 md:p-8 overflow-hidden">
          {visual}
        </div>
        <div className="border-t px-6 py-6 md:px-8">
          <h3 className="text-xl font-semibold mb-2">{title}</h3>
          <p className="text-foreground-secondary leading-relaxed max-w-xl">
            {body}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-full md:col-span-1 flex flex-col md:flex-row border-b bg-background">
      <div className="md:w-2/5 px-6 py-6 md:px-8 flex flex-col justify-center">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-foreground-secondary leading-relaxed">{body}</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 md:p-8 border-t md:border-t-0 md:border-l overflow-hidden">
        {visual}
      </div>
    </div>
  );
}
