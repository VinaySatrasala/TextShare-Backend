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
exports.httpServer = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const jwt_1 = require("./middlewares/jwt");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const uuid_1 = require("uuid");
const base62_1 = __importDefault(require("base62"));
const cors_1 = __importDefault(require("cors"));
const WebSocket_1 = require("./WebSocket");
const PORT = process.env.PORT || 8080;
const app = (0, express_1.default)();
exports.app = app;
const prisma = new client_1.PrismaClient();
app.use((0, cookie_parser_1.default)()); // Add this middleware before your route handlers
const httpServer = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
exports.httpServer = httpServer;
(0, WebSocket_1.setupWebSocket)(httpServer);
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: "http://localhost:5173", // Your frontend's URL
    credentials: true, // Allow credentials (cookies)
}));
// Sign up endpoint
app.post('/signup', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password } = req.body;
    console.log(name);
    const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
    try {
        const user = yield prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        });
        if (!user) {
            return res.status(400).json({ error: 'Internal error' });
        }
        const token = (0, jwt_1.createToken)(user.id);
        // Set the JWT token as a cookie (HTTP-Only)
        res.cookie('token', token, {
            httpOnly: true, // Ensures the cookie can't be accessed via JavaScript
            secure: true, // Set to true in production for HTTPS
            maxAge: 3600000, // 1 hour
            sameSite: 'None', // Prevents the cookie from being sent in cross-site requests
        });
        res.status(200).json({ message: 'User created successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error });
    }
}));
// Sign in endpoint
app.post('/signin', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    console.log(req.body);
    try {
        const user = yield prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        const validPassword = yield bcryptjs_1.default.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }
        const token = (0, jwt_1.createToken)(user.id);
        // Set the JWT token as a cookie (HTTP-Only)
        res.cookie('token', token, {
            httpOnly: true, // Ensures the cookie can't be accessed via JavaScript
            secure: true, // Set to true in production for HTTPS
            maxAge: 3600000, // 1 hour
            sameSite: 'None', // Prevents the cookie from being sent in cross-site requests
        });
        console.log('Signed in successfully');
        res.json({ message: 'Signed in successfully', name: user.name });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Error signing in' });
    }
}));
// @ts-ignore
app.get("/auth", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("reached");
    const { userId } = req.user;
    try {
        const user = yield prisma.user.findUnique({
            where: {
                id: userId
            }, select: {
                name: true,
            }
        });
        res.status(200).json({ valid: true, name: user === null || user === void 0 ? void 0 : user.name });
    }
    catch (error) {
        res.status(200).json({ valid: true, name: "User" });
    }
}));
app.get("/", (req, res) => {
    res.json({
        "message": "Hello"
    });
});
app.post("/logout", (req, res) => {
    res.clearCookie('token').json({ message: 'Logged out successfully' });
});
// @ts-ignore
app.post("/createRoom", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.userId;
    const { roomName } = req.body;
    try {
        const user = yield prisma.user.findUnique({
            where: { id: userId },
            select: { rooms_created: true },
        });
        if (user === null || user === void 0 ? void 0 : user.rooms_created.includes(roomName)) {
            return res.status(400).json({ message: "Room with same name already exists" });
        }
        if (!user || user.rooms_created.length >= 4) {
            return res.status(400).json({ message: "Room creation limit exceeded" });
        }
        // Generate a short and unique room ID
        const uuid = (0, uuid_1.v4)().replace(/-/g, ''); // Remove hyphens for compactness
        const roomId = base62_1.default.encode(parseInt(uuid.slice(-8), 16)); // Convert last 8 chars to number
        const newRoom = yield prisma.room.create({
            data: {
                name: roomName,
                roomId,
                adminId: userId,
            },
        });
        res.status(200).json({
            message: "Room created successfully",
            room: newRoom,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
}));
// @ts-ignore
app.post("/joinRoom", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.user;
    const { code } = req.body;
    try {
        // Find the room and include the users relation
        const room = yield prisma.room.findUnique({
            where: {
                roomId: code,
            },
            include: {
                users: true, // Include the users array
            },
        });
        // If room not found
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        // Check if the user is already in the room
        const userAlreadyInRoom = room.users.some((user) => user.id === userId);
        if (userAlreadyInRoom) {
            return res.status(400).json({ message: "You are already in the room" });
        }
        // Check if the room already has 30 users
        if (room.users.length >= 30) {
            return res.status(400).json({ message: "Room is full" });
        }
        // Add the user to the room
        yield prisma.room.update({
            where: {
                id: room.id,
            },
            data: {
                users: {
                    connect: { id: userId }, // Connect the user to the room
                },
            },
        });
        res.status(200).json({ message: "Joined the room successfully" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
}));
// @ts-ignore
app.post("/exitRoom", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.user;
    const { code } = req.body;
    try {
        // Update the room to disconnect the user
        yield prisma.room.update({
            where: {
                roomId: code, // Match the room by its unique ID
            },
            data: {
                users: {
                    disconnect: { id: userId }, // Disconnect the user from the room
                },
            },
        });
        res.status(200).json({ message: "Exited the room successfully" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "An error occurred while exiting the room" });
    }
}));
// @ts-ignore
app.post("/deleteRoom", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.user;
    const { code } = req.body;
    try {
        // Ensure the room exists and is owned by the authenticated user
        const room = yield prisma.room.findFirst({
            where: {
                roomId: code,
                adminId: Number(userId),
            },
        });
        if (!room) {
            return res.status(404).json({ message: "Room not found or you are not the admin." });
        }
        // Delete the room
        yield prisma.room.delete({
            where: { id: room.id },
        });
        res.status(200).json({ message: "Room deleted successfully." });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ message: "An error occurred while deleting the room." });
    }
}));
// @ts-ignore
app.get("/createdRooms", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.user;
    try {
        // Fetch the user and include rooms they created
        const user = yield prisma.user.findUnique({
            where: { id: userId },
            include: {
                rooms_created: true, // Fetch related rooms
            },
        });
        // Check if the user exists and has created rooms
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(user.rooms_created);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
}));
// @ts-ignore
app.get("/joinedRooms", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.user;
    try {
        const user = yield prisma.user.findUnique({
            where: {
                id: userId
            }, include: {
                rooms_joined: true
            }
        });
        res.status(200).json(user === null || user === void 0 ? void 0 : user.rooms_joined);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
}));
// @ts-ignore
app.get("/room/:code", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.user;
    const code = req.params.code;
    try {
        const room = yield prisma.room.findUnique({
            where: {
                roomId: code
            }, include: {
                users: {
                    select: { id: true, name: true, email: true }
                }
            }
        });
        const admin = yield prisma.user.findUnique({
            where: {
                id: room === null || room === void 0 ? void 0 : room.adminId
            }
        });
        console.log(room);
        res.status(200).json({ room, userId, adminName: admin === null || admin === void 0 ? void 0 : admin.name });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
}));
// @ts-ignore
app.post("/deleteUser", jwt_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.user;
    const { code, id } = req.body; // Destructure body values
    console.log(req.body);
    try {
        // Find the room by code and verify if the current user is the admin
        const room = yield prisma.room.findUnique({
            where: {
                roomId: code,
                adminId: userId, // Ensure the user is the admin of the room
            },
        });
        // If room doesn't exist or user is not the admin
        if (!room) {
            return res.status(400).json({
                message: "No such room exists or you are not the admin",
            });
        }
        // Disconnect the user from the room
        yield prisma.room.update({
            where: {
                roomId: code,
                adminId: userId, // Verify admin
            },
            data: {
                users: {
                    disconnect: { id }, // Disconnect user by their ID
                },
            },
        });
        res.status(200).json({
            message: "User removed successfully!",
        });
    }
    catch (error) {
        console.error(error); // Log the error for debugging
        res.status(500).json({
            message: "Something went wrong",
            error
        });
    }
}));
