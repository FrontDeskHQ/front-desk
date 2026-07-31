/**
 * Reveal keyframes used across the landing page (`fade-up`, `pop-in`, `blink`).
 * Owned by the page rather than by any one section — the shared mocks under
 * `shared/` reference these classes, so they must not depend on the hero being
 * mounted. Rendered once by the landing route.
 */

export function LandingMotionStyles() {
  return (
    <style>{`
      @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      .fade-up { animation: fadeUp .4s ease-out both; }
      @keyframes blink { 0%,100% { opacity:.25; } 50% { opacity:1; } }
      .blink { animation: blink 1s ease-in-out infinite; }
      @keyframes popIn {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to { opacity: 1; transform: none; }
      }
      .pop-in { animation: popIn .5s cubic-bezier(0.23, 1, 0.32, 1) both; }
      @media (prefers-reduced-motion: reduce) {
        .fade-up, .pop-in, .blink { animation: none; }
      }
    `}</style>
  );
}
