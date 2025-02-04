import express, { Request, Response, NextFunction} from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';



const JWT_SECRET = "vinay-kumar";

// Types


export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    // Retrieve token from cookies (assumes cookie name is 'token')
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: 'No token provided in cookies.' });
    }

    // Verify the token
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token.' });
        }

        // Add the decoded user info to the request (optional)
        req.user = decoded;
        // Proceed to the next middleware or route handler
        next();
    });
};
export function createToken(id: Number) {
  return jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' });

  
}
