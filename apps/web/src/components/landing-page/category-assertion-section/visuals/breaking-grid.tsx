import { cn } from "@workspace/ui/lib/utils";

/**
 * A 3×3 that degrades in reading order (left→right, then next row).
 * Offset, rotation, and opacity follow a flat exponential — nearly linear,
 * slight late acceleration — so structure frays gently until the end.
 * Perfect square for cols 17–22.
 */

type Cell = {
  tx: number;
  ty: number;
  rotate: number;
  opacity: number;
  dashed: boolean;
};

/** Normalized flat exponential: (e^(k·t) − 1) / (e^k − 1). Small k ≈ linear. */
const K = 0.7;

function flatExp(t: number) {
  return (Math.exp(K * t) - 1) / (Math.exp(K) - 1);
}

const N = 9;
const MAX_TX = 4;
const MAX_TY = 3.5;
const MAX_ROTATE = 1.25;
const MIN_OPACITY = 0.45;

/** Per-cell direction — magnitudes still follow flatExp; signs fray the grid. */
const DIR: { sx: number; sy: number; sr: number }[] = [
  { sx: 1, sy: 1, sr: 1 },
  { sx: 1, sy: -1, sr: -1 },
  { sx: -1, sy: 1, sr: 1 },
  { sx: 1, sy: 1, sr: -1 },
  { sx: -1, sy: -1, sr: 1 },
  { sx: 1, sy: -1, sr: -1 },
  { sx: -1, sy: 1, sr: 1 },
  { sx: 1, sy: 1, sr: -1 },
  { sx: -1, sy: -1, sr: 1 },
];

const CELLS: Cell[] = Array.from({ length: N }, (_, i) => {
  // First two stay perfect; decay runs across the remaining seven.
  if (i < 2) {
    return { tx: 0, ty: 0, rotate: 0, opacity: 1, dashed: false };
  }
  const t = (i - 2) / (N - 3);
  const e = flatExp(t);
  const { sx, sy, sr } = DIR[i];
  return {
    tx: MAX_TX * e * sx,
    ty: MAX_TY * e * sy,
    rotate: MAX_ROTATE * e * sr,
    opacity: 1 - e * (1 - MIN_OPACITY),
    dashed: i >= N - 5,
  };
});

function cellTransform({ tx, ty, rotate }: Cell) {
  if (!tx && !ty && !rotate) return undefined;
  return `translate(${tx}px, ${ty}px) rotate(${rotate}deg)`;
}

export function BreakingGridVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid aspect-square w-full grid-cols-3 grid-rows-3 gap-2 overflow-visible p-3",
        className
      )}
    >
      {CELLS.map((cell, i) => (
        <div
          key={i}
          className={cn(
            "border border-foreground-primary",
            cell.dashed && "border-dashed"
          )}
          style={{
            transform: cellTransform(cell),
            opacity: cell.opacity,
          }}
        />
      ))}
    </div>
  );
}
