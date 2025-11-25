import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignUpForm } from "~/components/auth";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/sign-up")({
  component: RouteComponent,
  loader: async () => {
    if (import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === "true") {
      throw redirect({ to: "/sign-in" });
    }
  },
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Sign Up - FrontDesk",
          description: "Create a new FrontDesk account",
        }),
      ],
    };
  },
});

function RouteComponent() {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center">
      <SignUpForm />
    </div>
  );
}
