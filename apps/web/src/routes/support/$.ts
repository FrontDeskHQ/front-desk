import { createFileRoute } from "@tanstack/react-router";

const goneHeaders = {
  "Cache-Control": "public, max-age=3600",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
};

const gone = () =>
  new Response("This FrontDesk support portal has been retired.", {
    headers: goneHeaders,
    status: 410,
  });

const goneHead = () =>
  new Response(null, {
    headers: goneHeaders,
    status: 410,
  });

export const Route = createFileRoute("/support/$")({
  server: {
    handlers: {
      GET: gone,
      HEAD: goneHead,
    },
  },
});
