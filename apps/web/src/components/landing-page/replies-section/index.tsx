/**
 * 02 — Handles it like you would.
 * Layout: title + one breath + visual + 2×2 topic grid.
 * Decorations: title `border-r`, topic sub-grid cell-owned borders (§5).
 */

import { ThreadDetailVisual } from "./thread-detail-visual";

const TOPICS = [
  {
    lead: "Resolves the routine, end to end.",
    body: "How-tos, status, refunds, common bugs — answered, not routed.",
  },
  {
    lead: "On-brand, never canned.",
    body: "Tuned on your past replies, docs, and tone. Reads like your best teammate wrote it.",
  },
  {
    lead: "Knows what it doesn't know.",
    body: "Asks or escalates instead of guessing.",
  },
  {
    lead: "Gets better every day.",
    body: "Every draft you edit becomes its training.",
  },
] as const;

export function RepliesSection() {
  return (
    <section
      id="handles-it"
      className="col-span-full grid grid-cols-24 scroll-mt-15"
    >
      {/* —— Title band —— */}
      <div className="col-span-full grid grid-cols-24 pt-24 pb-10 md:pt-32 md:pb-14">
        <div className="col-span-full flex flex-col gap-8 md:col-span-14 md:col-start-2 md:border-r md:pr-10">
          <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl">
            Handles it like you would.
          </h2>
          <p className="text-xl font-light tracking-tight text-foreground-secondary md:text-2xl">
            It doesn&apos;t just reply. It resolves.
          </p>
        </div>
        <div
          aria-hidden
          className="hidden md:col-span-8 md:col-start-16 md:block"
        />
      </div>

      {/* —— Visual band —— */}
      <div className="col-span-full grid grid-cols-24 border-b pb-10 md:pb-14">
        <div className="col-span-full md:col-span-20 md:col-start-2">
          <ThreadDetailVisual />
        </div>
      </div>

      {/* —— Topics: 2×2 sub-grid with cell-owned borders —— */}
      <ul className="col-span-full grid grid-cols-1 md:col-span-20 md:col-start-2 md:grid-cols-2">
        {TOPICS.map((topic, i) => {
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
              ].join(" ")}
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
