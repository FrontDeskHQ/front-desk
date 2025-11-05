import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/support/$slug/")({
  loader: ({ params }) => {
    throw redirect({
      to: "/support/$slug/threads",
      params,
    });
  },
});
