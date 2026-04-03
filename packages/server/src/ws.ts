import type { WebSocketServer, WebSocket } from "ws";
import type { WsMessage } from "@loopframe/shared";

let _wss: WebSocketServer | null = null;

export function initWss(wss: WebSocketServer) {
  _wss = wss;
  wss.on("connection", (ws: WebSocket) => {
    console.log("[ws] client connected");
    ws.on("close", () => console.log("[ws] client disconnected"));
  });
}

export function broadcast(message: WsMessage) {
  if (!_wss) return;
  const data = JSON.stringify(message);
  _wss.clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  });
}
