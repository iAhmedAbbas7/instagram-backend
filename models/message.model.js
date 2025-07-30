// <= IMPORTS =>
import mongoose from "mongoose";

// <= MESSAGE SEEN BY SCHEMA =>
const seenBySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seenAt: {
      type: Date,
      default: "",
    },
  },
  { _id: false }
);

// <= MESSAGE SCHEMA =>
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    message: { type: String, required: true },
    deliveredAt: { type: Date, default: null },
    seenBy: { type: [seenBySchema], default: [] },
  },
  { timestamps: true }
);

// <= EXPORTING THE MESSAGE SCHEMA =>
export const Message = mongoose.model("Message", messageSchema);
