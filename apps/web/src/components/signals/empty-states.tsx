function SignalsIllustration({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="103"
      viewBox="0 0 134 86"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M111.805 40.87C111.805 43.1 111.105 44.62 109.685 45.42L61.7348 72.91L44.9048 82.56C43.4848 83.37 41.8448 83.23 39.9548 82.14C38.0748 81.05 36.4248 79.29 35.0148 76.85L4.65479 24.48C3.23479 22.05 2.56479 19.73 2.62479 17.54C2.67479 15.34 3.41477 13.84 4.82477 13.04L5.27482 12.82C6.58482 12.27 8.11477 12.51 9.85477 13.51C11.7948 14.63 13.4748 16.41 14.8848 18.85L39.9548 62.29L49.2848 56.97L59.3448 51.24L99.8048 28.17L100.275 27.94C101.075 27.61 101.955 27.56 102.905 27.8C103.485 27.95 104.105 28.22 104.745 28.59C106.625 29.68 108.275 31.44 109.685 33.87C111.105 36.31 111.805 38.64 111.805 40.87Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M131.805 30.87C131.805 33.1 131.105 34.62 129.685 35.42L64.9048 72.56L64.4448 72.79L44.9048 82.56L61.7348 72.91L109.685 45.42C111.105 44.62 111.805 43.1 111.805 40.87C111.805 38.64 111.105 36.31 109.685 33.87C108.275 31.44 106.625 29.68 104.745 28.59C104.105 28.22 103.485 27.95 102.905 27.8C101.955 27.56 101.075 27.61 100.275 27.94L119.015 18.62L120.605 17.83C121.825 17.44 123.215 17.7 124.745 18.59C126.625 19.68 128.275 21.44 129.685 23.87C131.105 26.31 131.805 28.64 131.805 30.87Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M59.3448 51.2399L49.2849 56.9699L39.9549 62.2899L14.8849 18.8499C13.4749 16.4099 11.7949 14.6299 9.85486 13.5099C8.11486 12.5099 6.5849 12.2699 5.2749 12.8199L24.8249 3.03995C26.2349 2.22995 27.9149 2.38994 29.8549 3.50994C31.7949 4.62994 33.4749 6.40995 34.8849 8.84995L59.3448 51.2399Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <SignalsIllustration className="text-border" />
      <div className="max-w-lg space-y-3">
        <div className="text-foreground-primary text-2xl font-medium">
          {title}
        </div>
        <div className="text-foreground-secondary text-base">{description}</div>
      </div>
    </div>
  );
}

export function NewOrgEmpty() {
  return (
    <EmptyState
      title="Getting to know your threads"
      description="FrontDesk is reading through your threads. Your first signals will show up here shortly."
    />
  );
}

export function CaughtUpEmpty() {
  return (
    <EmptyState
      title="You're all caught up"
      description="Nothing needs you right now. FrontDesk has the rest."
    />
  );
}
