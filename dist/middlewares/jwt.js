"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
exports.createToken = createToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = "vinay-kumar";
// Types
const authenticateToken = (req, res, next) => {
    // Retrieve token from cookies (assumes cookie name is 'token')
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: 'No token provided in cookies.' });
    }
    // Verify the token
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token.' });
        }
        // Add the decoded user info to the request (optional)
        req.user = decoded;
        // Proceed to the next middleware or route handler
        next();
    });
};
exports.authenticateToken = authenticateToken;
function createToken(id) {
    return jsonwebtoken_1.default.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' });
}
