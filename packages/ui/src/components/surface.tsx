import { cn } from "../lib/utils";

export const HorizontalLine = ({
  variant = "full",
  style = "dashed",
}: {
  variant?: "full" | "outer";
  style?: "dashed" | "solid";
}) => {
  return (
    <div
      className={cn(
        "w-full h-px col-span-full",
        variant === "outer" && "-translate-y-full",
      )}
    >
      {variant === "full" ? (
        <div
          className={cn(
            "h-px border-b w-screen absolute left-0",
            style === "dashed" ? "border-dashed" : "border-solid",
          )}
        />
      ) : (
        <>
          <div
            className={cn(
              "h-px border-b absolute w-[50vw] right-full",
              style === "dashed" ? "border-dashed" : "border-solid",
            )}
          />
          <div
            className={cn(
              "h-px border-b absolute left-full w-[50vw]",
              style === "dashed" ? "border-dashed" : "border-solid",
            )}
          />
        </>
      )}
    </div>
  );
};

export const DashedPattern = ({
  spacing = 8,
  strokeWidth = 1,
  className,
  color = "currentColor",
}: {
  spacing?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
}) => {
  const patternId = `dashed-pattern-${spacing}-${strokeWidth}`;

  return (
    <svg
      className={cn("w-full h-full", className)}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={patternId}
          width={spacing}
          height={spacing}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={spacing}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
};
