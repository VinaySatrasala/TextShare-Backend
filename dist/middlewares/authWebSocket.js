"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateWebSocket = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_1 = __importDefault(require("cookie"));
const JWT_SECRET = "vinay-kumar"; // Keep this secret in an environment variable
const authenticateWebSocket = (req, ws) => {
    const cookies = cookie_1.default.parse(req.headers.cookie || "");
    const token = cookies.token;
    if (!token) {
        ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
        ws.close();
        return null;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return decoded; // Return decoded userId
    }
    catch (err) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
        ws.close();
        return null;
    }
};
exports.authenticateWebSocket = authenticateWebSocket;
