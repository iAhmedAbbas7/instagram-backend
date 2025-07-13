// <= IMPORTS =>
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  createConversation,
  getAllMessages,
  getConversationMessages,
  getUserConversations,
  sendMessage,
} from "../controllers/chat.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.get(
  "/conversation/:id/messages",
  isAuthenticated,
  getConversationMessages
);
router.post("/send/:id", isAuthenticated, sendMessage);
router.get("/all/:id", isAuthenticated, getAllMessages);
router.get("/conversations", isAuthenticated, getUserConversations);
router.post("/newConversation", isAuthenticated, createConversation);

export default router;
