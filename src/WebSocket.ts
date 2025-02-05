import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";
import { PrismaClient } from "@prisma/client";
import cookie from "cookie";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = "vinay-kumar"; // Store this in an env variable

const rooms: Record<string, Set<WebSocket>> = {}; // Store room connections

export const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws: WebSocket, request) => {
    let roomId: string | null = null;

    // Extract cookies from handshake headers
    const token = request.headers.cookie?.slice(6);

    console.log(token);
    if (!token) {
      ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
      ws.close(); // Close connection if no token
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      const userId = decoded.userId;

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message.toString());

          if (data.type === "join") {
            roomId = data.roomId;
            if (!roomId) {
              ws.send(JSON.stringify({ type: "error", message: "Room ID is required" }));
              ws.close(); // Close connection if no room ID
              return;
            }

            // Check if the user belongs to the room
            const foundRoom = await prisma.room.findUnique({
              where: { roomId },
              include: { users: { select: { id: true } } },
            });
            if (!foundRoom || 
              (!foundRoom.users.some((user) => user.id === userId) && foundRoom.adminId !== userId)) {
            ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
            ws.close(); // Close connection if access is denied
            return;
          }
          

            if (!rooms[roomId]) rooms[roomId] = new Set();
            rooms[roomId].add(ws);

            ws.send(JSON.stringify({ type: "success", message: "Joined room successfully" }));
          } else if (data.type === "message" && roomId) {
            rooms[roomId]?.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "message", text: data.text }));
              }
            });
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid data format" }));
          ws.close(); // Close connection if message format is invalid
        }
      });

      ws.on("close", () => {
        if (roomId && rooms[roomId]) {
          rooms[roomId].delete(ws);
          if (rooms[roomId].size === 0) delete rooms[roomId];
        }
      });

    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
      ws.close(); // Close connection if token is invalid
    }
  });

  console.log("WebSocket server is running...");
};
