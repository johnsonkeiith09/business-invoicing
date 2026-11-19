import { createFileRoute } from "@tanstack/react-router";

// A JSON liveness check for members and personal access tokens.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true }),
    },
  },
});
