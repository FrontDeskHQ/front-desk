import { cn } from "@workspace/ui/lib/utils";

export const PriorityIndicator = ({ priority }: { priority: number }) => {
  return (
    <div
      className={cn(
        "h-[11px] w-[14px] flex justify-between items-center",
        priority > 0 && "items-end",
      )}
    >
      <div
        className={cn(
          "w-[3px] h-3/5 rounded-full bg-primary/50",
          priority >= 1 && "bg-primary",
          priority === 0 && "h-1",
        )}
      />
      <div
        className={cn(
          "w-[3px] h-4/5 rounded-full bg-primary/50",
          priority >= 2 && "bg-primary",
          priority === 0 && "h-1",
        )}
      />
      <div
        className={cn(
          "w-[3px] h-full rounded-full bg-primary/50",
          priority >= 3 && "bg-primary",
          priority === 0 && "h-1",
        )}
      />
    </div>
  );
};

export const priorityText: Record<number, string> = {
  0: "No priority",
  1: "Low",
  2: "Medium",
  3: "High",
  // 4: "Urgent",
};

export const PriorityText = ({ priority }: { priority: number }) => {
  return priorityText[priority];
};

type PredefinedShapeStatus = {
  label: string;
  color: string;
  predefinedShape: "x" | "horizontal-bar" | "check";
};

type AngleStatus = {
  label: string;
  color: string;
  angle: number;
};

export const statusValues: Record<number, AngleStatus | PredefinedShapeStatus> =
  {
    0: { label: "Open", color: "text-foreground-secondary", angle: 0 },
    1: {
      label: "In progress",
      color: "dark:text-amber-300/90 text-yellow-500",
      angle: 180,
    },
    2: {
      label: "Resolved",
      color: "dark:text-green-700 text-green-600",
      predefinedShape: "check",
    },
    3: {
      label: "Closed",
      color: "text-foreground-tertiary",
      predefinedShape: "x",
    },
    4: {
      label: "Duplicated",
      color: "text-foreground-tertiary",
      predefinedShape: "horizontal-bar",
    },
  };

const angularPaddingRad = (Math.PI * 10) / 180; // 15 degrees in radians

const PartialIndicator = ({
  angle,
  fillRadius,
  outlineRadius,
  center,
}: {
  angle: number;
  fillRadius: number;
  outlineRadius: number;
  center: number;
}) => {
  const angleRad = (angle * Math.PI) / 180;

  const startX = center;
  const startY = center - fillRadius;
  const endX = center + fillRadius * Math.sin(angleRad);
  const endY = center - fillRadius * Math.cos(angleRad);
  const largeArcFlag = angle > 180 ? 1 : 0;

  const outlineStartX = center + outlineRadius * Math.sin(0.1);
  const outlineStartY = center - outlineRadius * Math.cos(0.1);
  const outlineEndX = center + outlineRadius * Math.sin(angleRad * 0.96);
  const outlineEndY = center - outlineRadius * Math.cos(angleRad * 0.96);
  const outlineLargeArcFlag = angle > 180 ? 1 : 0;

  const remainingAngle = 360 - angle;
  const dashCount = angle >= 270 ? 1 : angle >= 180 ? 3 : angle >= 90 ? 5 : 7;
  const dashArc =
    ((remainingAngle * Math.PI) / 180 - angularPaddingRad) / dashCount;

  const dashes = Array.from({ length: dashCount }, (_, i) => {
    const filledArc = (2 / 7) * dashArc;
    const gap = (5 / 4) * filledArc;
    const startAngle = angleRad + i * dashArc + gap + angularPaddingRad / 2;
    const endAngle = startAngle + filledArc;

    return {
      startX: center + outlineRadius * Math.sin(startAngle),
      startY: center - outlineRadius * Math.cos(startAngle),
      endX: center + outlineRadius * Math.sin(endAngle),
      endY: center - outlineRadius * Math.cos(endAngle),
    };
  });

  return (
    <>
      <path
        d={`M${outlineStartX} ${outlineStartY} A${outlineRadius} ${outlineRadius} 0 ${outlineLargeArcFlag} 1 ${outlineEndX} ${outlineEndY}`}
        stroke="currentColor"
        shapeRendering="auto"
      />
      {dashes.map((dash, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: false positive
          key={i}
          d={`M${dash.startX} ${dash.startY} A${outlineRadius} ${outlineRadius} 0 0 1 ${dash.endX} ${dash.endY}`}
          stroke="currentColor"
          shapeRendering="auto"
        />
      ))}
      <path
        d={`M${startX} ${startY} A${fillRadius} ${fillRadius} 0 ${largeArcFlag} 1 ${endX} ${endY} L${center} ${center} Z`}
        fill="currentColor"
      />
    </>
  );
};

export const StatusIndicator = ({
  status,
  className,
}: {
  status: number;
  className?: string;
}) => {
  if (!statusValues[status]) {
    return null;
  }

  if ("predefinedShape" in statusValues[status]) {
    if (statusValues[status].predefinedShape === "x") {
      return (
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("size-3.5", statusValues[status].color, className)}
        >
          <title>{statusValues[status].label}</title>
          <path
            d="M16 1C24.2843 1 31 7.71573 31 16C31 24.2843 24.2843 31 16 31C7.71573 31 1 24.2843 1 16C1 7.71573 7.71573 1 16 1ZM22.2412 9.75879C21.753 9.27091 20.9607 9.27073 20.4727 9.75879L15.999 14.2314L11.5264 9.75879C11.0382 9.27091 10.2469 9.27073 9.75879 9.75879C9.27073 10.2469 9.27091 11.0382 9.75879 11.5264L14.2314 15.999L9.75879 20.4727C9.27073 20.9607 9.27091 21.753 9.75879 22.2412C10.2469 22.729 11.0383 22.729 11.5264 22.2412L15.999 17.7676L20.4727 22.2412C20.9608 22.7293 21.7531 22.7293 22.2412 22.2412C22.7293 21.7531 22.7293 20.9608 22.2412 20.4727L17.7676 15.999L22.2412 11.5264C22.729 11.0383 22.729 10.2469 22.2412 9.75879Z"
            fill="currentColor"
          />
        </svg>
      );
    }

    if (statusValues[status].predefinedShape === "horizontal-bar") {
      return (
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("size-3.5", statusValues[status].color, className)}
        >
          <title>{statusValues[status].label}</title>
          <path
            d="M16 1C24.2843 1 31 7.71573 31 16C31 24.2843 24.2843 31 16 31C7.71573 31 1 24.2843 1 16C1 7.71573 7.71573 1 16 1ZM8.42383 14.5C7.59554 14.5 6.92402 15.1718 6.92383 16C6.92404 16.828 7.59489 17.4996 8.42285 17.5H23.5762C24.4043 17.4998 25.076 16.8281 25.0762 16C25.076 15.1717 24.4035 14.5 23.5752 14.5H8.42383Z"
            fill="currentColor"
          />
        </svg>
      );
    }

    if (statusValues[status].predefinedShape === "check") {
      return (
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("size-3.5", statusValues[status].color, className)}
        >
          <title>{statusValues[status].label}</title>
          <path
            d="M16 1C24.2843 1 31 7.71573 31 16C31 24.2843 24.2843 31 16 31C7.71573 31 1 24.2843 1 16C1 7.71573 7.71573 1 16 1ZM24.6074 10.9443C24.1943 10.3915 23.4114 10.2775 22.8584 10.6904L12.8496 18.165L10.0068 14.3604C9.59379 13.8073 8.81092 13.6935 8.25781 14.1064C7.70478 14.5196 7.59084 15.3034 8.00391 15.8564L11.5938 20.6631C12.0068 21.2162 12.7916 21.3291 13.3447 20.916L24.3545 12.6934C24.9074 12.2802 25.0204 11.4974 24.6074 10.9443Z"
            fill="currentColor"
          />
        </svg>
      );
    }
  }

  const outlineRadius = 14;
  const fillRadius = 8;
  const center = 16;
  const svgSize = 32;

  const angle = (statusValues[status] as AngleStatus).angle;

  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("stroke-4 size-3.5", statusValues[status].color, className)}
      strokeLinecap="round"
    >
      <title>{statusValues[status].label}</title>
      {angle > 0 && angle < 360 && (
        <PartialIndicator
          angle={angle}
          fillRadius={fillRadius}
          outlineRadius={outlineRadius}
          center={center}
        />
      )}
      {(angle === 360 || angle === 0) && (
        <circle
          cx={center}
          cy={center}
          r={outlineRadius}
          stroke="currentColor"
          shapeRendering="auto"
          strokeDasharray={angle === 0 ? "4 10" : undefined}
        />
      )}
    </svg>
  );
};

export const StatusText = ({ status }: { status: number }) => {
  return statusValues[status]?.label ?? "";
};
