// <= IMPORTS =>
import express from "express";
import { singleUpload } from "../middleware/multer.js";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  createGroupChat,
  getAllMessages,
  getConversationMessages,
  getUserConversations,
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
router.get("/conversations", isAuthenticated, getUserConversations);
router.post("/conversation/:id/send", isAuthenticated, sendGroupMessage);
router.post("/groupChat", isAuthenticated, singleUpload, createGroupChat);

export default router;
