// <= IMPORTS =>
import express from "express";
import { singleUpload } from "../middleware/multer.js";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  clearConversation,
  createGroupChat,
  deleteConversation,
  getAllMessages,
  getConversationMessages,
  getUserConversations,
  markConversationRead,
  sendGroupMessage,
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
router.get("/markRead/:id", isAuthenticated, markConversationRead);
router.get("/conversations", isAuthenticated, getUserConversations);
router.delete("/conversation/:id", isAuthenticated, deleteConversation);
router.get("/clearConversation/:id", isAuthenticated, clearConversation);
router.post("/conversation/:id/send", isAuthenticated, sendGroupMessage);
router.post("/groupChat", isAuthenticated, singleUpload, createGroupChat);

export default router;
