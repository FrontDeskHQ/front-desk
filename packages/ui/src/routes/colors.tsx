import { Button } from "@/components/button";
import { CopyInput } from "@/components/copy-value";
import { createFileRoute } from "@tanstack/react-router";
import Color from "colorjs.io";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

export const Route = createFileRoute("/colors")({
  component: RouteComponent,
});

type ThemeSwatch = {
  token: string;
  utility: string;
  swatchClassName: string;
};

type CssVarSwatch = {
  name: string;
  varRef: string;
  swatchClassName: string;
};

const SURFACE_SCALE: ThemeSwatch[] = [
  {
    token: "background-primary",
    utility: "bg-background-primary",
    swatchClassName: "bg-background-primary",
  },
  {
    token: "background-secondary",
    utility: "bg-background-secondary",
    swatchClassName: "bg-background-secondary",
  },
  {
    token: "background-tertiary",
    utility: "bg-background-tertiary",
    swatchClassName: "bg-background-tertiary",
  },
  {
    token: "background-quaternary",
    utility: "bg-background-quaternary",
    swatchClassName: "bg-background-quaternary",
  },
];

const FOREGROUND_SCALE: ThemeSwatch[] = [
  {
    token: "foreground-primary",
    utility: "text-foreground-primary",
    swatchClassName: "bg-foreground-primary",
  },
  {
    token: "foreground-secondary",
    utility: "text-foreground-secondary",
    swatchClassName: "bg-foreground-secondary",
  },
  {
    token: "foreground-tertiary",
    utility: "text-foreground-tertiary",
    swatchClassName: "bg-foreground-tertiary",
  },
];

const BORDER_SCALE: ThemeSwatch[] = [
  {
    token: "border-primary",
    utility: "border-border-primary",
    swatchClassName:
      "border-2 border-border-primary bg-background-primary",
  },
  {
    token: "border-secondary",
    utility: "border-border-secondary",
    swatchClassName:
      "border-2 border-border-secondary bg-background-primary",
  },
  {
    token: "border-tertiary",
    utility: "border-border-tertiary",
    swatchClassName:
      "border-2 border-border-tertiary bg-background-primary",
  },
  {
    token: "border-quaternary",
    utility: "border-border-quaternary",
    swatchClassName:
      "border-2 border-border-quaternary bg-background-primary",
  },
];

const LABEL_CSS_VARS: CssVarSwatch[] = [
  {
    name: "label-color-red",
    varRef: "var(--label-color-red)",
    swatchClassName: "bg-[var(--label-color-red)]",
  },
  {
    name: "label-color-orange",
    varRef: "var(--label-color-orange)",
    swatchClassName: "bg-[var(--label-color-orange)]",
  },
  {
    name: "label-color-yellow",
    varRef: "var(--label-color-yellow)",
    swatchClassName: "bg-[var(--label-color-yellow)]",
  },
  {
    name: "label-color-green",
    varRef: "var(--label-color-green)",
    swatchClassName: "bg-[var(--label-color-green)]",
  },
  {
    name: "label-color-teal",
    varRef: "var(--label-color-teal)",
    swatchClassName: "bg-[var(--label-color-teal)]",
  },
  {
    name: "label-color-blue",
    varRef: "var(--label-color-blue)",
    swatchClassName: "bg-[var(--label-color-blue)]",
  },
  {
    name: "label-color-purple",
    varRef: "var(--label-color-purple)",
    swatchClassName: "bg-[var(--label-color-purple)]",
  },
  {
    name: "label-color-pink",
    varRef: "var(--label-color-pink)",
    swatchClassName: "bg-[var(--label-color-pink)]",
  },
];

const canvasRgbStringFromCss = (cssColor: string): string | null => {
  if (typeof document === "undefined") {
    return null;
  }
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = "#000000";
  ctx.fillStyle = cssColor;
  return String(ctx.fillStyle);
};

const normalizeHexWithAlpha = (hexInput: string) => {
  const hex = hexInput.trim().toLowerCase();
  if (!hex.startsWith("#")) {
    return hexInput;
  }
  if (hex.length === 4) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}ff`;
  }
  if (hex.length === 7) {
    return `${hex}ff`;
  }
  if (hex.length === 9) {
    return hex;
  }
  return hex;
};

const colorFromComputed = (raw: string): Color | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new Color(trimmed);
  } catch {
    const rgbLike = canvasRgbStringFromCss(trimmed);
    if (!rgbLike) {
      return null;
    }
    try {
      return new Color(rgbLike);
    } catch {
      return null;
    }
  }
};

const resolveRawCssColor = (
  raw: string,
): { hex: string; oklch: string } | null => {
  const color = colorFromComputed(raw);
  if (!color) {
    return null;
  }
  const oklch = color.to("oklch").toString({ precision: 4 });
  const hexRaw = color.to("srgb").toString({ format: "hex", collapse: false });
  return { hex: normalizeHexWithAlpha(hexRaw), oklch };
};

const useSampledColor = (
  sample: "background" | "border",
  refreshKey: string | undefined,
) => {
  const swatchRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<{ hex: string; oklch: string } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = swatchRef.current;
    if (!el) {
      return;
    }

    const read = () => {
      const cs = getComputedStyle(el);
      const raw =
        sample === "border" ? cs.borderTopColor : cs.backgroundColor;
      setResolved(resolveRawCssColor(raw));
    };

    read();
    const raf = requestAnimationFrame(read);

    const ro = new ResizeObserver(read);
    ro.observe(el);

    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [sample, refreshKey]);

  return { swatchRef, resolved };
};

const HexOklchCopyRow = ({
  resolved,
}: {
  resolved: { hex: string; oklch: string } | null;
}) => {
  const handleCopyHex = async () => {
    if (!resolved) {
      return;
    }
    await navigator.clipboard.writeText(resolved.hex);
  };

  const handleCopyOklch = async () => {
    if (!resolved) {
      return;
    }
    await navigator.clipboard.writeText(resolved.oklch);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!resolved}
          onClick={handleCopyHex}
        >
          Copy hex (8-digit)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!resolved}
          onClick={handleCopyOklch}
        >
          Copy OKLCH
        </Button>
      </div>
      {resolved ? (
        <div className="flex flex-col gap-1 font-mono text-[11px] leading-snug text-foreground-tertiary">
          <div className="break-all">
            <span className="text-foreground-secondary">Hex (#RRGGBBAA) </span>
            {resolved.hex}
          </div>
          <div className="break-all">
            <span className="text-foreground-secondary">OKLCH </span>
            {resolved.oklch}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-foreground-tertiary">Resolving…</div>
      )}
    </div>
  );
};

const ThemeSwatchCard = ({
  row,
  colorSample,
}: {
  row: ThemeSwatch;
  colorSample: "background" | "border";
}) => {
  const { resolvedTheme } = useTheme();
  const { swatchRef, resolved } = useSampledColor(colorSample, resolvedTheme);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-primary p-3">
      <div
        ref={swatchRef}
        className={`h-14 w-full shrink-0 rounded-md ${row.swatchClassName}`}
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <div className="font-mono text-xs text-foreground-secondary">
          {row.token}
        </div>
        <div className="flex items-center gap-1">
          <code className="min-w-0 flex-1 truncate rounded border border-border-primary bg-background-secondary px-2 py-1 font-mono text-xs">
            {row.utility}
          </code>
          <CopyInput.Button
            value={row.utility}
            ariaLabel={`Copy ${row.utility}`}
            className="shrink-0"
          />
        </div>
      </div>
      <HexOklchCopyRow resolved={resolved} />
    </div>
  );
};

const CssVarSwatchCard = ({ row }: { row: CssVarSwatch }) => {
  const { resolvedTheme } = useTheme();
  const { swatchRef, resolved } = useSampledColor("background", resolvedTheme);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-primary p-3">
      <div
        ref={swatchRef}
        className={`h-14 w-full shrink-0 rounded-md border border-border-primary ${row.swatchClassName}`}
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <div className="font-mono text-xs text-foreground-secondary">
          {row.name}
        </div>
        <div className="flex items-center gap-1">
          <code className="min-w-0 flex-1 truncate rounded border border-border-primary bg-background-secondary px-2 py-1 font-mono text-xs">
            {row.varRef}
          </code>
          <CopyInput.Button
            value={row.varRef}
            ariaLabel={`Copy ${row.varRef}`}
            className="shrink-0"
          />
        </div>
      </div>
      <HexOklchCopyRow resolved={resolved} />
    </div>
  );
};

const TokenSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-foreground-secondary">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
};

function RouteComponent() {
  return (
    <div className="flex max-w-5xl flex-col gap-12">
      <div>
        <h1 className="text-lg font-medium">Colors</h1>
        <p className="mt-2 text-sm text-foreground-secondary">
          Design-system ramps and label colors from{" "}
          <code className="rounded border border-border-primary bg-background-tertiary px-1 py-0.5 font-mono text-xs">
            globals.css
          </code>{" "}
          (<span className="font-mono text-xs">@theme inline</span>
          ). Use the suggested Tailwind utilities for ramps; label colors use CSS
          variables only. Values are read from computed styles; conversions use{" "}
          <span className="font-mono text-xs">colorjs.io</span> (dev dependency).
          Hex is normalized to <span className="font-mono text-xs">#RRGGBBAA</span>{" "}
          (alpha <span className="font-mono text-xs">ff</span> when fully opaque).
        </p>
      </div>

      <TokenSection
        title="Surface scale"
        description="Stacked background ramp used across layouts."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SURFACE_SCALE.map((row) => (
            <ThemeSwatchCard key={row.token} row={row} colorSample="background" />
          ))}
        </div>
      </TokenSection>

      <TokenSection
        title="Foreground scale"
        description="Text and icon emphasis levels. Swatches use background fills so you can compare values."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FOREGROUND_SCALE.map((row) => (
            <ThemeSwatchCard key={row.token} row={row} colorSample="background" />
          ))}
        </div>
      </TokenSection>

      <TokenSection
        title="Border scale"
        description="Borders derived from foreground tones."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BORDER_SCALE.map((row) => (
            <ThemeSwatchCard key={row.token} row={row} colorSample="border" />
          ))}
        </div>
      </TokenSection>

      <TokenSection
        title="Label colors"
        description="Defined on :root / .dark as --label-color-*. Use with arbitrary properties, e.g. bg-[var(--label-color-blue)]."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LABEL_CSS_VARS.map((row) => (
            <CssVarSwatchCard key={row.name} row={row} />
          ))}
        </div>
      </TokenSection>
    </div>
  );
}
