import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";

const rooms: Record<string, Set<WebSocket>> = {}; // Store room connections

export const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket) => {
    let roomId: string | null = null;

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString());
      console.log(message);
      if (data.type === "join") {
        // User joins a room
        roomId = data.roomId;
        if (roomId !== null) {
          if (!rooms[roomId]) rooms[roomId] = new Set();
          rooms[roomId].add(ws);
          console.log(`Client joined room: ${roomId}`);
        }
      } else if (data.type === "message" && roomId) {
        // Broadcast message to all users in the room
        rooms[roomId]?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "message", text: data.text }));
          }
        });
      }
    });

    ws.on("close", () => {
      if (roomId && rooms[roomId]) {
        rooms[roomId].delete(ws);
        if (rooms[roomId].size === 0) delete rooms[roomId]; // Remove empty rooms
        console.log(`Client left room: ${roomId}`);
      }
    });

    ws.on("error", (err) => console.error("WebSocket error:", err));
  });

  console.log("WebSocket server is running...");
};
