import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import {createClient} from "redis"
const prisma = new PrismaClient();
const JWT_SECRET = "vinay-kumar"; // Store this in an env variable

const rooms: Record<string, Set<WebSocket>> = {}; // Store room connections
const userConnections: Map<WebSocket, number> = new Map(); // Map WebSocket connections to user IDs

// Create Redis client
const redisClient = createClient({
  url: ""
});
redisClient.connect();
redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Error connecting to Redis:', err);
});

export const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws: WebSocket, request) => {
    let roomId: string | null = null;

    // Extract cookies from handshake headers
    const token = request.headers.cookie?.match(/token=([^;]*)/)?.[1];
    console.log("Token:", token);
        if (!token) {
      ws.send(
        JSON.stringify({ type: "error", message: "Authentication required" })
      );
      ws.close(); // Close connection if no token
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      const userId = decoded.userId;

      // Store the user ID in the WebSocket connection object
      userConnections.set(ws, userId);

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message.toString());

          if (data.type === "join") {
            roomId = data.roomId;
            if (!roomId) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Room ID is required",
                })
              );
              ws.close(); // Close connection if no room ID
              return;
            }

            // Check if the user belongs to the room
            const foundRoom = await prisma.room.findUnique({
              where: { roomId },
              include: { users: { select: { id: true,name:true } } },
            });
            if (
              !foundRoom ||
              (!foundRoom.users.some((user) => user.id === userId) &&
                foundRoom.adminId !== userId)
            ) {
              ws.send(
                JSON.stringify({ type: "error", message: "Access denied" })
              );
              ws.close(); // Close connection if access is denied
              return;
            }

            if (!rooms[roomId]) rooms[roomId] = new Set();
            rooms[roomId].add(ws);

            const activeConnections: number[] = []; // Store active user IDs

            rooms[roomId]?.forEach((socket) => {
                if (userConnections.has(socket)) {
                    activeConnections.push(userConnections.get(socket)!);
                }
            });

            ws.send(
              JSON.stringify({
                type: "success",
                message: JSON.stringify({
                  message : "Joined room successfully",
                  activeUsers : activeConnections
                }),
              })
            );

            // Retrieve messages from Redis for the last 24 hours
            try {
              const messages = await redisClient.zRangeByScore(
                `room:${roomId}:messages`,
                Date.now() - 86400000, // 24 hours in milliseconds
                Date.now()
              );

              // Send the messages to the user
              messages.forEach((msg) => {
                ws.send(
                  JSON.stringify({ type: "message", text: msg })
                );
              });
            } catch (err) {
              console.error("Error retrieving messages from Redis", err);
            }

            rooms[roomId]?.forEach((client) => {
              console.log(foundRoom.users);
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "user_joined",
                    message: JSON.stringify({ 
                      id: userId, 
                      name: foundRoom.users.find(x => x.id == userId)?.name 
                    }),
                  
                  })
                );
              }
            });
          } else if (data.type === "message" && roomId) {
            // Store the message in Redis with timestamp as score
            const timestamp = Date.now();
            redisClient.zAdd(`room:${roomId}:messages`, [
              {
                score: timestamp,
                value: data.text
              }
            ]).catch(err => {
              console.error("Error saving message to Redis", err);
            });

            // Set TTL for the message (24 hours)
            redisClient.expire(`room:${roomId}:messages`, 86400)
              .catch((err) => {
                console.error("Error setting TTL for Redis key", err);
              });

            // Broadcast the message to other users in the room
            rooms[roomId]?.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({ type: "message", text: data.text })
                );
              }
            });
          } else if (data.type === "removeUser" && roomId && userId) {
            const userToRemoveId = data.userId;

            // Check if the room exists
            if (!rooms[roomId]) {
              ws.send(
                JSON.stringify({ type: "error", message: "Room not found" })
              );
              return;
            }

            // Find the WebSocket connection for the user to remove
            const userWs = Array.from(rooms[roomId]).find(
              (client) => userConnections.get(client) === userToRemoveId
            );

            // Check if the user to remove exists in the room
            if (!userWs) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "User not found in the room",
                })
              );
              return;
            }

            // Disconnect the user
            userWs.send(
              JSON.stringify({
                type: "removed",
                message:
                  "You are being removed by admin. Contact admin or join again",
              })
            );
            userWs.close();

            // Remove from room
            rooms[roomId].delete(userWs);

            // Notify other clients in the room about the removal
            rooms[roomId].forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "user-removed",
                    message: JSON.stringify({ userRemoved: userToRemoveId }),
                  })
                );
              }
            });
          }
        } catch (err) {
          ws.send(
            JSON.stringify({ type: "error", message: "Invalid data format" })
          );
          ws.close(); // Close connection if message format is invalid
        }
      });

      ws.on("close", () => {
        if (roomId && rooms[roomId]) {
          rooms[roomId].forEach((client) => {
            if (client != ws && client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "user_offline",
                  message: JSON.stringify(userConnections.get(ws)),
                })
              );
            }
          });

          rooms[roomId].delete(ws);
          if (rooms[roomId].size === 0) delete rooms[roomId];
        }

        // Remove user from the mapping when the connection is closed
        userConnections.delete(ws);
      });
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
      console.log(err)
      ws.close(); // Close connection if token is invalid
    }
  });

  console.log("WebSocket server is running...");
};
