"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.createToken = createToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = "vinay-kumar";
// Middleware to verify JWT token from cookies
function authenticateToken(req, res, next) {
    const token = req.cookies.token; // Get the token from cookies
    if (!token)
        return res.status(403).json({ error: 'No token provided' });
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            return res.status(403).json({ error: 'Invalid token' });
        req.user = user; // Attach user info to request
        next();
    });
}
function createToken(id) {
    return jsonwebtoken_1.default.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' });
}
