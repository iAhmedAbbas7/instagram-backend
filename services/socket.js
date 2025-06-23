// <= IMPORTS =>
import http from "http";
import express from "express";
import { Server } from "socket.io";
import { User } from "../models/user.model.js";

// <= CREATING APP INSTANCE =>
const app = express();

// <= CREATING SERVER =>
const server = http.createServer(app);

// <= SOCKET SERVER INSTANCE =>
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
  },
});

// <= SOCKET MAP FOR USERS ID'S =>
const userSocketMap = {};

// <= UTILITY FUNCTION TO GET THE RECEIVER SOCKET ID =>
export const getReceiverSocketId = (receiverId) => userSocketMap[receiverId];

// <= ESTABLISHING SOCKET CONNECTION =>
io.on("connection", (socket) => {
  // SETTING USER ID
  const userId = socket.handshake.query.userId;
  // IF USER ID FOUND
  if (userId) {
    // ADDING USER IN THE USER SOCKET MAP CORRESPONDING TO IT'S SOCKET ID
    userSocketMap[userId] = socket.id;
    // LOGGING CONNECTION MESSAGE
    console.log(
      `User Connected : UserId => ${userId} , SocketId => ${socket.id}`
    );
  }
  // EMITTING THE USER ONLINE EVENT
  io.emit("getOnlineUsers", Object.keys(userSocketMap));
  // ON SOCKET DISCONNECTION
  socket.on("disconnect", async () => {
    if (userId) {
      // REMOVING THE USER FROM THE SOCKET MAP WITH IT'S CORRESPONDING SOCKET ID
      delete userSocketMap[userId];
      // UPDATING THE USER LAST ACTIVE TIMESTAMP
      await User.findByIdAndUpdate(userId, { lastActive: new Date() });
      // LOGGING THE DISCONNECTION MESSAGE
      console.log(
        `User Disconnected : UserId => ${userId} , SocketId => ${socket.id}`
      );
    }
    // EMITTING THE USER ONLINE EVENT
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

// EXPORTING THE APP, SERVER AND IO
export { app, server, io };
