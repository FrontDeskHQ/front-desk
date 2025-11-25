import { createFileRoute } from "@tanstack/react-router";
import { SignInForm } from "~/components/auth";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/sign-in")({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Sign In - FrontDesk",
          description: "Sign in to your FrontDesk account",
        }),
      ],
    };
  },
});

function RouteComponent() {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center">
      <SignInForm />
    </div>
  );
}
