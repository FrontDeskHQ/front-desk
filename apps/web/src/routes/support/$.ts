import { createFileRoute } from "@tanstack/react-router";

const gone = () =>
  new Response("This FrontDesk support portal has been retired.", {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
    status: 410,
  });

export const Route = createFileRoute("/support/$")({
  server: {
    handlers: {
      GET: gone,
      HEAD: gone,
    },
  },
});
