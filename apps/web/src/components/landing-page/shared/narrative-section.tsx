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

      {/* —— Topics: 2×2 sub-grid with cell-owned borders —— */}
      <ul className="col-span-full grid grid-cols-1 md:col-span-20 md:col-start-2 md:grid-cols-2">
        {topics.map((topic, i) => {
          const isRight = i % 2 === 1;
          const isBottom = i >= 2;

          return (
            <li
              key={topic.lead}
              className={[
                "flex flex-col gap-3 py-10 md:py-12",
                !isRight && "md:border-r md:pr-10",
                isRight && "md:pl-10",
                !isBottom && "border-b",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <p className="text-xl font-medium tracking-tight text-foreground-primary md:text-2xl">
                {topic.lead}
              </p>
              <p className="max-w-md text-base leading-relaxed text-foreground-secondary">
                {topic.body}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
