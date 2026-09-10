import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { ViteDevServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { dropSocket, handleSocket, hydrateRooms, ingestSocketMessage } from "./hub";

export async function attachGameServer(server: ViteDevServer): Promise<void> {
  await hydrateRooms();
  const wss = new WebSocketServer({ noServer: true });
  const http = server.httpServer;
  if (!http) return;

  http.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = req.url ?? "";
    if (!url.startsWith("/ws")) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const wrapper = {
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
    };
    handleSocket(wrapper);
    ws.on("message", (buf) => {
      ingestSocketMessage(wrapper, buf.toString());
    });
    ws.on("close", () => dropSocket(wrapper));
  });

  console.info("[ski] websocket /ws ready");
}
