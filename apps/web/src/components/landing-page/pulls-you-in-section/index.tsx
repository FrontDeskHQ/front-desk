/**
 * 03 — Pulls you in only when it matters.
 * Layout: title + one breath + visual + 2×2 topic grid.
 * Decorations: title `border-r`, topic sub-grid cell-owned borders (§5).
 */

import { SignalsVisual } from "./signals-visual";

const TOPICS = [
  {
    lead: "The hard 20% comes to you.",
    body: "With full context and a suggested reply, ready to send.",
  },
  {
    lead: "You set the rules.",
    body: "Decide what the Agent sends on its own and what always needs a human.",
  },
  {
    lead: "No black box.",
    body: "Every autonomous reply is logged, attributed, and reversible.",
  },
  {
    lead: "Your time, where it matters.",
    body: "Attention goes to the relationships that need you.",
  },
] as const;

export function PullsYouInSection() {
  return (
    <section
      id="pulls-you-in"
      className="col-span-full grid grid-cols-24 scroll-mt-15"
    >
      {/* —— Title band —— */}
      <div className="col-span-full grid grid-cols-24 pt-24 pb-10 md:pt-32 md:pb-14">
        <div className="col-span-full flex flex-col gap-8 md:col-span-14 md:col-start-2 md:border-r md:pr-10">
          <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl">
            Pulls you in
            <br />
            only when it matters.
          </h2>
          <p className="text-xl font-light tracking-tight text-foreground-secondary md:text-2xl">
            The Agent does the heavy lifting. You own the moments that count.
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
          <SignalsVisual />
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
