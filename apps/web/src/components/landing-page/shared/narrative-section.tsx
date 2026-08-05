/**
 * The shell every numbered narrative section shares: title band + one breath,
 * a full-width visual band, then a topic grid — three-up on one row for three
 * topics, two-up rows otherwise.
 * Decorations: topic sub-grid cell-owned borders
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

/**
 * Topic rows. Three topics go three-up on one row (8 cols each) rather than
 * 2 + 1, which would leave half the second row empty. Everything else is
 * two-up rows of 12.
 */
function topicRows(
  topics: readonly NarrativeTopic[]
): readonly NarrativeTopic[][] {
  if (topics.length === 3) return [[...topics]];

  return Array.from({ length: Math.ceil(topics.length / 2) }, (_, row) =>
    topics.slice(row * 2, row * 2 + 2)
  );
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
        <div className="col-span-full max-md:col-span-22 max-md:col-start-2 flex flex-col gap-8 md:col-span-14 md:col-start-2">
          <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl">
            {title}
          </h2>
          <p className="text-xl font-light tracking-tight text-foreground-secondary md:text-2xl">
            {breath}
          </p>
        </div>
        {/* Empty cells keep the column rhythm visible beside the copy */}
        <div
          aria-hidden
          className="hidden md:col-span-8 md:col-start-16 md:block"
        />
      </div>

      {/* —— Visual band —— */}
      <div className="col-span-full grid grid-cols-24 border-b pb-10 md:pb-14">
        <div className="col-span-22 col-start-2">{visual}</div>
      </div>

      {/* —— Topics: two-up rows of 12, or one three-up row of 8 (see
           `topicRows`). Each cell is its own sub-grid with 1-col side gutters,
           and owns its right/bottom rule — the last cell in a row has none, so
           no rule ever runs into the outer rail (§5). —— */}
      <ul className="col-span-full list-none">
        {topicRows(topics).map((cells, row, rows) => {
          const isLastRow = row === rows.length - 1;
          const isThreeUp = cells.length === 3;

          return (
            <li
              key={cells[0].lead}
              className={[
                // 24 columns at every width: the topic cells below use
                // `max-md:col-start-2 / col-span-22`, which needs the full track
                // count to resolve instead of overflowing a 1-column parent.
                "grid grid-cols-24",
                !isLastRow && "border-b",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cells.map((topic, col) => (
                <div
                  key={topic.lead}
                  className={[
                    "grid grid-cols-1 py-10 max-md:col-span-22 max-md:col-start-2 md:py-12",
                    isThreeUp
                      ? "md:col-span-8 md:grid-cols-8"
                      : "md:col-span-12 md:grid-cols-12",
                    col < cells.length - 1
                      ? "border-b md:border-r md:border-b-0"
                      : "",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "col-span-full flex flex-col gap-3 md:col-start-2",
                      isThreeUp ? "md:col-span-6" : "md:col-span-10",
                    ].join(" ")}
                  >
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
          );
        })}
      </ul>
    </section>
  );
}
