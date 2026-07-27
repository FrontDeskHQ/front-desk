/**
 * Tension — the problem beat between hero and solution.
 * Prose on cols 2–9; cols 10–12 stay empty for breathing room.
 */

export function TensionSection() {
  return (
    <section
      id="tension"
      className="col-span-full grid grid-cols-12 scroll-mt-15 py-12 md:py-16"
    >
      <div className="col-span-full flex flex-col gap-8 md:col-span-8 md:col-start-2">
        <h2 className="text-3xl font-medium tracking-tight text-foreground-primary md:text-4xl">
          You won your first customers by caring.
          <br />
          It&apos;s also the first thing to break when you grow.
        </h2>

        <p className="text-xl font-light tracking-tight text-foreground-secondary md:text-2xl">
          Every tool makes you choose:{" "}
          <span className="text-foreground-primary">scale or care</span>.
          FrontDesk removes the choice.
        </p>
      </div>
    </section>
  );
}
