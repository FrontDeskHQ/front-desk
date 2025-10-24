import { createFileRoute } from "@tanstack/react-router";
import { SignInForm } from "~/components/auth";

export const Route = createFileRoute("/sign-in")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center">
      <SignInForm />
    </div>
  );
}
