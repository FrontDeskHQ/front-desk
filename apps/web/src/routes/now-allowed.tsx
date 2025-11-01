import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { authClient } from "~/lib/auth-client";

export const Route = createFileRoute("/now-allowed")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full gap-2">
      Your email is not on the allowlist for the beta.
      <br />
      <span>
        Apply to the waitlist{" "}
        <Link to="/" className="underline">
          here
        </Link>
        .
      </span>
      <Button
        variant="outline"
        onClick={() =>
          authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                navigate({ to: "/" });
              },
            },
          })
        }
      >
        Log out
      </Button>
    </div>
  );
}
