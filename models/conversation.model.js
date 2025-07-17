// <= IMPORTS =>
import mongoose from "mongoose";

// <= CONVERSATION SCHEMA =>
const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    messages: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
    ],
    type: {
      type: String,
      enum: ["ONE-TO-ONE", "GROUP"],
      default: "ONE-TO-ONE",
    },
    name: { type: String, default: "" },
    avatar: { type: String, default: "" },
    avatarPublicId: { type: String, default: "" },
  },
  { timestamps: true }
);

// <= EXPORTING THE CONVERSATION SCHEMA =>
export const Conversation = mongoose.model("Conversation", conversationSchema);
