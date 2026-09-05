import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SignInForm } from "~/components/auth";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/sign-in")({
  component: RouteComponent,
  head: () => ({
    meta: [
      ...seo({
        title: "Sign In - FrontDesk",
        description: "Sign in to your FrontDesk account",
      }),
    ],
  }),
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
});

function RouteComponent() {
  const { redirect } = Route.useSearch();
  const callbackURL =
    redirect && /^\/app(?:[/?#]|$)/.test(redirect) ? redirect : "/app";

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center">
      <SignInForm callbackURL={callbackURL} />
    </div>
  );
}
