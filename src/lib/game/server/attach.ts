import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { dropSocket, handleSocket, hydrateRooms, ingestSocketMessage } from "./hub";
import { authenticateUpgrade, type SocketIdentity } from "./identity.server";

/** Refuse the upgrade at the HTTP level: no socket, no game, no ambiguity. */
function refuse(socket: Duplex, status: number, reason: string): void {
  const text = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Server Error";
  socket.write(
    `HTTP/1.1 ${status} ${text}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(reason)}\r\n\r\n` +
      reason,
  );
  socket.destroy();
}

/**
 * Serve the authoritative game on `/ws`.
 *
 * Takes a bare `http.Server` rather than a Vite dev server so the same wiring
 * can serve dev, preview and the deployed container — the preview hook used to
 * be an empty stub, which left the built app with no game server at all.
 */
export async function attachGameServer(http: HttpServer | undefined | null): Promise<void> {
  if (!http) return;
  await hydrateRooms();
  const wss = new WebSocketServer({ noServer: true });

  http.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = req.url ?? "";
    if (!url.startsWith("/ws")) return;
    // Verify the session before accepting, so an unauthorised client never
    // gets a socket it could send intents on.
    void authenticateUpgrade(req.headers.cookie).then(
      (auth) => {
        if (!auth.ok) {
          refuse(socket, auth.status, auth.reason);
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req, auth.identity);
        });
      },
      (err: unknown) => {
        console.error("[ski] upgrade auth failed", err);
        refuse(socket, 500, "Server Error");
      },
    );
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, identity: SocketIdentity | null) => {
    const wrapper = {
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
    };
    handleSocket(wrapper, identity);
    ws.on("message", (buf) => {
      ingestSocketMessage(wrapper, buf.toString(), identity);
    });
    ws.on("close", () => dropSocket(wrapper));
  });

  console.info("[ski] websocket /ws ready");
}
