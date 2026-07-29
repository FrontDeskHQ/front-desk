/**
 * 01 — Picks up every conversation.
 * Layout: title + one breath + visual + 2×2 topic grid.
 * Decorations: title `border-r`, topic sub-grid cell-owned borders (§5).
 */

import { ThreadsListVisual } from "./threads-list-visual";

const TOPICS = [
  {
    lead: "Where your customers already are.",
    body: "Native to Slack, Discord, email, and GitHub — not another portal to check.",
  },
  {
    lead: "Triaged the moment it lands.",
    body: "24/7. Nothing waits for office hours.",
  },
  {
    lead: "Nothing slips.",
    body: "Every thread is seen, tagged, and tracked — even when no one's watching.",
  },
  {
    lead: "Context from the first word.",
    body: "Knows the customer's history and past threads before it responds.",
  },
] as const;

export function PicksUpSection() {
  return (
    <section
      id="picks-up"
      className="col-span-full grid grid-cols-24 scroll-mt-15"
    >
      {/* —— Title band —— */}
      <div className="col-span-full grid grid-cols-24 pt-24 pb-10 md:pt-32 md:pb-14">
        <div className="col-span-full flex flex-col gap-8 md:col-span-14 md:col-start-2 md:border-r md:pr-10">
          <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl">
            Picks up every conversation.
          </h2>
          <p className="text-xl font-light tracking-tight text-foreground-secondary md:text-2xl">
            Native to where your customers already are — triaged the moment it
            lands, with full context, even when no one&apos;s watching.
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
        <div className="col-span-full md:col-span-20 md:col-start-2">
          <ThreadsListVisual />
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
