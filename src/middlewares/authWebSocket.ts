import jwt from "jsonwebtoken";
import cookie from "cookie";
import { WebSocket } from "ws";
import { IncomingMessage } from "http";

const JWT_SECRET = "vinay-kumar"; // Keep this secret in an environment variable

export const authenticateWebSocket = (req: IncomingMessage, ws: WebSocket): { userId: number } | null => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.token;

  if (!token) {
    ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
    ws.close();
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    return decoded; // Return decoded userId
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
    ws.close();
    return null;
  }
};
