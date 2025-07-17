// <= IMPORTS =>
import mongoose from "mongoose";

// <= MESSAGE SCHEMA =>
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return !this.conversationId;
      },
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: function () {
        return !this.receiverId;
      },
    },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

// <= EXPORTING THE MESSAGE SCHEMA =>
export const Message = mongoose.model("Message", messageSchema);
