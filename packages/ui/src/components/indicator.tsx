import { cn } from "@workspace/ui/lib/utils";
import { Check, X } from "lucide-react";

export const PriorityIndicator = ({ priority }: { priority: number }) => {
  return (
    <div
      className={cn(
        "h-4 w-[17px] p-px flex justify-between items-center",
        priority > 0 && "items-end",
      )}
    >
      <div
        className={cn(
          "w-[3px] h-1/3 rounded-full bg-primary/50",
          priority >= 1 && "bg-primary",
          priority === 0 && "h-1",
        )}
      />
      <div
        className={cn(
          "w-[3px] h-2/3 rounded-full bg-primary/50",
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
  4: "Urgent",
};

export const PriorityText = ({ priority }: { priority: number }) => {
  return priorityText[priority];
};

export const statusValues: Record<
  number,
  {
    label: string;
    color: string;
    angle: number;
    icon?: React.ComponentType<any>;
  }
> = {
  0: { label: "Open", color: "text-primary", angle: 0 },
  1: { label: "In progress", color: "text-yellow-300", angle: 180 },
  2: { label: "Resolved", color: "text-chart-2", angle: 360, icon: Check },
  3: { label: "Closed", color: "text-chart-5/75", angle: 360, icon: X },
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

  const outlineRadius = 14;
  const fillRadius = 8;
  const center = 16;
  const svgSize = 32;

  const angle = statusValues[status].angle;

  const Icon = statusValues[status].icon;

  return (
    <div className={cn("relative", className)}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("stroke-4 size-3.5", statusValues[status].color)}
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
      {(angle === 360 || angle === 0) && Icon && (
        <Icon
          className={cn(
            "size-2.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 stroke-4",
            statusValues[status].color,
          )}
        />
      )}
    </div>
  );
};

export const StatusText = ({ status }: { status: number }) => {
  return statusValues[status]?.label ?? "";
};
