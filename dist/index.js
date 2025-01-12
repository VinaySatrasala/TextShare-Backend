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
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const jwt_1 = require("./middlewares/jwt");
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const httpServer = app.listen(8080);
app.use(express_1.default.json());
// Sign up endpoint
app.post('/signup', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password } = req.body;
    const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
    try {
        const user = yield prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        });
        const token = (0, jwt_1.createToken)({ id: Number(user.id) });
        // Set the JWT token as a cookie (HTTP-Only)
        res.cookie('token', token, {
            httpOnly: true, // Ensures the cookie can't be accessed via JavaScript
            secure: process.env.NODE_ENV === 'production', // Set to true in production for HTTPS
            maxAge: 3600000, // 1 hour
            sameSite: 'strict', // Prevents the cookie from being sent in cross-site requests
        });
        res.json({ message: 'User created successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error creating user' });
    }
}));
// Sign in endpoint
app.post('/signin', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    try {
        const user = yield prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        const validPassword = yield bcryptjs_1.default.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }
        const token = (0, jwt_1.createToken)({ id: Number(user.id) });
        // Set the JWT token as a cookie (HTTP-Only)
        res.cookie('token', token, {
            httpOnly: true, // Ensures the cookie can't be accessed via JavaScript
            secure: process.env.NODE_ENV === 'production', // Set to true in production for HTTPS
            maxAge: 3600000, // 1 hour
            sameSite: 'strict', // Prevents the cookie from being sent in cross-site requests
        });
        res.json({ message: 'Signed in successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error signing in' });
    }
}));
