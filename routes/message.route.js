// <= IMPORTS =>
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  getAllMessages,
  getUserConversations,
  sendMessage,
} from "../controllers/chat.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.post("/send/:id", isAuthenticated, sendMessage);
router.get("/all/:id", isAuthenticated, getAllMessages);
router.get("/conversations", isAuthenticated, getUserConversations);

export default router;
