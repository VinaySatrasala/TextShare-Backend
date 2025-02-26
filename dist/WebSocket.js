"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocket = void 0;
const ws_1 = require("ws");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_1 = require("redis");
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET; // Store this in an env variable
const rooms = {}; // Store room connections
const userConnections = new Map(); // Map WebSocket connections to user IDs
if (!JWT_SECRET) {
    console.error("JWT_SECRET is not defined in the environment variables");
    process.exit(1);
}
if (!process.env.REDIS_URL) {
    console.error("REDIS_URL is not defined in the environment variables");
    process.exit(1);
}
// Create Redis client
const redisClient = (0, redis_1.createClient)({
    url: process.env.REDIS_URL
});
redisClient.connect();
redisClient.on('connect', () => {
    console.log('Connected to Redis');
});
redisClient.on('error', (err) => {
    console.error('Error connecting to Redis:', err);
});
const setupWebSocket = (server) => {
    const wss = new ws_1.WebSocketServer({ server });
    wss.on("connection", (ws, request) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        let roomId = null;
        // Extract cookies from handshake headers
        const token = (_b = (_a = request.headers.cookie) === null || _a === void 0 ? void 0 : _a.match(/token=([^;]*)/)) === null || _b === void 0 ? void 0 : _b[1];
        console.log("Token:", token);
        if (!token) {
            ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
            ws.close(); // Close connection if no token
            return;
        }
        try {
            // Verify JWT token
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            const userId = decoded.userId;
            // Store the user ID in the WebSocket connection object
            userConnections.set(ws, userId);
            ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
                var _a, _b, _c;
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === "join") {
                        roomId = data.roomId;
                        if (!roomId) {
                            ws.send(JSON.stringify({
                                type: "error",
                                message: "Room ID is required",
                            }));
                            ws.close(); // Close connection if no room ID
                            return;
                        }
                        // Check if the user belongs to the room
                        const foundRoom = yield prisma.room.findUnique({
                            where: { roomId },
                            include: { users: { select: { id: true, name: true } } },
                        });
                        if (!foundRoom ||
                            (!foundRoom.users.some((user) => user.id === userId) &&
                                foundRoom.adminId !== userId)) {
                            ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
                            ws.close(); // Close connection if access is denied
                            return;
                        }
                        if (!rooms[roomId])
                            rooms[roomId] = new Set();
                        rooms[roomId].add(ws);
                        const activeConnections = []; // Store active user IDs
                        (_a = rooms[roomId]) === null || _a === void 0 ? void 0 : _a.forEach((socket) => {
                            if (userConnections.has(socket)) {
                                activeConnections.push(userConnections.get(socket));
                            }
                        });
                        ws.send(JSON.stringify({
                            type: "success",
                            message: JSON.stringify({
                                message: "Joined room successfully",
                                activeUsers: activeConnections
                            }),
                        }));
                        // Retrieve messages from Redis for the last 24 hours
                        try {
                            const messages = yield redisClient.zRangeByScore(`room:${roomId}:messages`, Date.now() - 86400000, // 24 hours in milliseconds
                            Date.now());
                            // Send the messages to the user
                            messages.forEach((msg) => {
                                ws.send(JSON.stringify({ type: "message", text: msg }));
                            });
                        }
                        catch (err) {
                            console.error("Error retrieving messages from Redis", err);
                        }
                        (_b = rooms[roomId]) === null || _b === void 0 ? void 0 : _b.forEach((client) => {
                            var _a;
                            console.log(foundRoom.users);
                            if (client.readyState === ws_1.WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: "user_joined",
                                    message: JSON.stringify({
                                        id: userId,
                                        name: (_a = foundRoom.users.find(x => x.id == userId)) === null || _a === void 0 ? void 0 : _a.name
                                    }),
                                }));
                            }
                        });
                    }
                    else if (data.type === "message" && roomId) {
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
                        (_c = rooms[roomId]) === null || _c === void 0 ? void 0 : _c.forEach((client) => {
                            if (client.readyState === ws_1.WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: "message", text: data.text }));
                            }
                        });
                    }
                    else if (data.type === "removeUser" && roomId && userId) {
                        const userToRemoveId = data.userId;
                        // Check if the room exists
                        if (!rooms[roomId]) {
                            ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
                            return;
                        }
                        // Find the WebSocket connection for the user to remove
                        const userWs = Array.from(rooms[roomId]).find((client) => userConnections.get(client) === userToRemoveId);
                        // Check if the user to remove exists in the room
                        if (!userWs) {
                            ws.send(JSON.stringify({
                                type: "error",
                                message: "User not found in the room",
                            }));
                            return;
                        }
                        // Disconnect the user
                        userWs.send(JSON.stringify({
                            type: "removed",
                            message: "You are being removed by admin. Contact admin or join again",
                        }));
                        userWs.close();
                        // Remove from room
                        rooms[roomId].delete(userWs);
                        // Notify other clients in the room about the removal
                        rooms[roomId].forEach((client) => {
                            if (client.readyState === ws_1.WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: "user-removed",
                                    message: JSON.stringify({ userRemoved: userToRemoveId }),
                                }));
                            }
                        });
                    }
                }
                catch (err) {
                    ws.send(JSON.stringify({ type: "error", message: "Invalid data format" }));
                    ws.close(); // Close connection if message format is invalid
                }
            }));
            ws.on("close", () => {
                if (roomId && rooms[roomId]) {
                    rooms[roomId].forEach((client) => {
                        if (client != ws && client.readyState === ws_1.WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: "user_offline",
                                message: JSON.stringify(userConnections.get(ws)),
                            }));
                        }
                    });
                    rooms[roomId].delete(ws);
                    if (rooms[roomId].size === 0)
                        delete rooms[roomId];
                }
                // Remove user from the mapping when the connection is closed
                userConnections.delete(ws);
            });
        }
        catch (err) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
            console.log(err);
            ws.close(); // Close connection if token is invalid
        }
    }));
    console.log("WebSocket server is running...");
};
exports.setupWebSocket = setupWebSocket;
