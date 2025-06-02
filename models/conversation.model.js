// <= IMPORTS =>
import mongoose from "mongoose";

// <= CONVERSATION SCHEMA =>
const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    messages: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
  },
  { timestamps: true }
);

// <= EXPORTING THE CONVERSATION SCHEMA =>
export const Conversation = mongoose.model("Conversation", conversationSchema);
