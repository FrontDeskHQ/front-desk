import { createFileRoute } from "@tanstack/react-router";

import { OneLinerSection } from "~/components/landing-page/one-liner-section";

export const Route = createFileRoute("/explore-one-liner")({
  component: RouteComponent,
});

/** Isolated preview of the landing one-liner section. */
function RouteComponent() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background-primary">
      <OneLinerSection />
    </main>
  );
}
