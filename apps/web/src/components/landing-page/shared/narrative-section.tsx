/**
 * The shell every numbered narrative section shares: title band + one breath,
 * a full-width visual band, then a 2×2 topic grid.
 * Decorations: title `border-r`, topic sub-grid cell-owned borders
 * (DESIGN_SPEC.md §5 — note that file is gitignored).
 * Sections own only their copy, topics, and visual.
 */

import type * as React from "react";

export interface NarrativeTopic {
  lead: string;
  body: string;
}

interface NarrativeSectionProps {
  id: string;
  /** Section title — may contain <br /> for the intended line break. */
  title: React.ReactNode;
  /** The single breath under the title. */
  breath: React.ReactNode;
  visual: React.ReactNode;
  topics: readonly NarrativeTopic[];
}

export function NarrativeSection({
  id,
  title,
  breath,
  visual,
  topics,
}: NarrativeSectionProps) {
  return (
    <section id={id} className="col-span-full grid grid-cols-24 scroll-mt-15">
      {/* —— Title band —— */}
      <div className="col-span-full grid grid-cols-24 pt-24 pb-10 md:pt-32 md:pb-14">
        <div className="col-span-full flex flex-col gap-8 md:col-span-14 md:col-start-2 md:border-r md:pr-10">
          <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl">
            {title}
          </h2>
          <p className="text-xl font-light tracking-tight text-foreground-secondary md:text-2xl">
            {breath}
          </p>
        </div>
        {/* Empty cells keep the column rhythm visible beside the copy */}
        <div aria-hidden className="hidden md:col-span-8 md:col-start-16 md:block" />
      </div>

      {/* —— Visual band —— */}
      <div className="col-span-full grid grid-cols-24 border-b pb-10 md:pb-14">
        <div className="col-span-full md:col-span-20 md:col-start-2">
          {visual}
        </div>
      </div>

      {/* —— Topics: 2×2 — each half is 12 cols; inner 12-col sub-grid with 1-col side gutters —— */}
      <ul className="col-span-full list-none">
        {[0, 2].map((rowStart) => (
          <li
            key={rowStart}
            className={[
              "grid grid-cols-1 md:grid-cols-24",
              rowStart === 0 && "border-b",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {topics.slice(rowStart, rowStart + 2).map((topic, col) => (
              <div
                key={topic.lead}
                className={[
                  "grid grid-cols-1 py-10 md:col-span-12 md:grid-cols-12 md:py-12",
                  col === 0
                    ? "border-b md:border-r md:border-b-0"
                    : "",
                ].join(" ")}
              >
                <div className="col-span-full flex flex-col gap-3 md:col-span-10 md:col-start-2">
                  <p className="text-xl font-medium tracking-tight text-foreground-primary md:text-2xl">
                    {topic.lead}
                  </p>
                  <p className="text-base leading-relaxed text-foreground-secondary">
                    {topic.body}
                  </p>
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
