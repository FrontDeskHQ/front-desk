/**
 * Category assertion — the beat between hero and the numbered sections.
 *
 * This is NOT a problem statement. Three slots: (1) fragment naming the
 * category with one differentiating modifier, (2) audience + mechanism,
 * (3) FrontDesk in the subject position, landing on the job. No pain, no
 * negation of the reader, "you" is never the subject. A revision that
 * reintroduces the reader's problem here has broken the section.
 *
 * Col 1 is the page gutter. Prose on cols 2–15; visual spans cols 17–22.
 */

export function CategoryAssertionSection() {
  return (
    <section
      id="category"
      className="col-span-full grid grid-cols-24 scroll-mt-15"
    >
      <div className="col-span-full max-md:col-span-22 max-md:col-start-2 py-24 md:col-span-14 md:col-start-2 md:py-32">
        <p className="text-3xl font-light tracking-tight text-foreground-secondary md:text-4xl">
          <span className="text-foreground-primary">
            A support tool built for caring, not for clearing a queue.
          </span>{" "}
          Made for teams that are too busy to answer everything and care too
          much to answer badly, FrontDesk gives every customer the reply
          you&apos;d have written yourself.
        </p>
      </div>
    </section>
  );
}
