import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, createToken } from './middlewares/jwt';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';
import base62 from 'base62';
import cors from 'cors';
import redis from 'redis';
import { setupWebSocket } from './WebSocket';

const app = express();
const prisma = new PrismaClient();
app.use(cookieParser()); // Add this middleware before your route handlers
const httpServer = app.listen(8080);
setupWebSocket(httpServer);
app.use(express.json());

app.use(cors({
  origin: "http://localhost:5173", // Your frontend's URL
  credentials: true,              // Allow credentials (cookies)
}));


declare global {
  namespace Express {
      interface Request {
          user?: any
      }
  }
}


// Sign up endpoint
app.post('/signup', async (req:any, res:any) => {
  const { name, email, password }: { name: string; email: string; password: string } = req.body;
  console.log(name);  
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Interna error' });
    }

    const token = createToken(user.id);

    // Set the JWT token as a cookie (HTTP-Only)
    res.cookie('token', token, {
      httpOnly: false,       // Ensures the cookie can't be accessed via JavaScript
      secure: false, // Set to true in production for HTTPS
      maxAge: 3600000,      // 1 hour
      sameSite: 'None',   // Prevents the cookie from being sent in cross-site requests
    });

    res.status(200).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ error: error});
  }
});

// Sign in endpoint
app.post('/signin', async (req: any, res: any) => {
  const { email, password }: { email: string; password: string } = req.body;
  console.log(req.body);
  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = createToken(user.id);

    // Set the JWT token as a cookie (HTTP-Only)
    res.cookie('token', token, {
      httpOnly: true,       // Ensures the cookie can't be accessed via JavaScript
      secure: true, // Set to true in production for HTTPS
      maxAge: 3600000,      // 1 hour
      sameSite: 'None',   // Prevents the cookie from being sent in cross-site requests
    });
    console.log('Signed in successfully');
    res.json({ message: 'Signed in successfully' });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Error signing in' });
  }
});

// @ts-ignore
app.get("/auth", authenticateToken,(req: Request, res: Response) => {
  console.log("reached")
    res.status(200).json({ valid: true });
})

app.post("/logout", (req: Request, res: Response) => {
  res.clearCookie('token').json({ message: 'Logged out successfully' });
});

// @ts-ignore
app.post("/createRoom", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user.userId;
  const { roomName } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { rooms_created: true },
    });

    if(user?.rooms_created.includes(roomName)){
      return res.status(400).json({ message: "Room with same name already exists" });
    }
    if (!user || user.rooms_created.length >= 4) {
      return res.status(400).json({ message: "Room creation limit exceeded" });
    }

    // Generate a short and unique room ID
    const uuid = uuidv4().replace(/-/g, ''); // Remove hyphens for compactness
    const roomId = base62.encode(parseInt(uuid.slice(-8), 16)); // Convert last 8 chars to number

    const newRoom = await prisma.room.create({
      data: {
        name : roomName,
        roomId,
        adminId: userId,
      },
    });

    res.status(201).json({
      message: "Room created successfully",
      room: newRoom,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

// @ts-ignore
app.post("/joinRoom", authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { code } = req.body;

  try {
    // Find the room and include the users relation
    const room = await prisma.room.findUnique({
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
    await prisma.room.update({
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});


// @ts-ignore
app.post("/exitRoom", authenticateToken, async (req, res) => {
  const { userId } = req.user; 
  const { code } = req.body;

  try {
    // Update the room to disconnect the user
    await prisma.room.update({
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred while exiting the room" });
  }
});

// @ts-ignore
app.post("/deleteRoom", authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { code } = req.body;

  try {
    // Ensure the room exists and is owned by the authenticated user
    const room = await prisma.room.findFirst({
      where: {
        roomId: code,
        adminId: Number(userId),
      },
    });

    if (!room) {
      return res.status(404).json({ message: "Room not found or you are not the admin." });
    }

    // Delete the room
    await prisma.room.delete({
      where: { id: room.id },
    });

    res.status(200).json({ message: "Room deleted successfully." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "An error occurred while deleting the room." });
  }
});


// @ts-ignore
app.get("/createdRooms", authenticateToken, async (req, res) => {
  const { userId } = req.user;

  try {
    // Fetch the user and include rooms they created
    const user = await prisma.user.findUnique({
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

// @ts-ignore
app.get("/joinedRooms",authenticateToken,async (req,res)=>{
  const {userId} = req.user;

  try {
    const user = await prisma.user.findUnique({
      where : {
        id : userId
      },include : {
        rooms_joined : true
      }
    })

    res.status(200).json(user?.rooms_joined)
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});


// @ts-ignore
app.get("/room/:code",authenticateToken,async(req,res)=>{
  const { userId } = req.user;
  const code = req.params.code;

  try{
    const room = await prisma.room.findUnique({
      where : {
        roomId : code
      },include:{
        users : {
          select: { id: true, name: true, email: true }
        }
      }
    })
    res.status(200).json(room);
  }catch(error){
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});


// @ts-ignore
app.get("/deleteUser", authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { code, id } = req.body; // Destructure body values

  try {
    // Find the room by code and verify if the current user is the admin
    const room = await prisma.room.findUnique({
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
    await prisma.room.update({
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
  } catch (error) {
    console.error(error); // Log the error for debugging
    res.status(500).json({
      message: "Something went wrong",
      error
    });
  }
});


export { app, httpServer };