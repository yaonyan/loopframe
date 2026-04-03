import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { app } from "./app.js";
import { initWss } from "./ws.js";

const PORT = parseInt(process.env.PORT ?? "3001");

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[loopframe] server listening on http://localhost:${info.port}`);
});

// WebSocket server shares the same port via upgrade
const wss = new WebSocketServer({ noServer: true });
initWss(wss);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wss.handleUpgrade(req, socket as any, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});
