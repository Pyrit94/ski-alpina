import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/**
 * Better Auth on `/api/auth/*`.
 *
 * Everything else about sign-in was wired, but no route ever handed requests
 * to the handler: `/api/auth/get-session` answered 404, so the game socket —
 * which asks exactly that endpoint who a cookie belongs to — refused every
 * player once the roster was enforced.
 */
const handle = ({ request }: { request: Request }) => auth.handler(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
