// <= IMPORTS =>
import mongoose from "mongoose";

// <= PARTICIPANT SCHEMA =>
const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastRead: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    mutedUntil: { type: Date, default: null },
  },
  { _id: false }
);

// <= CONVERSATION SCHEMA =>
const conversationSchema = new mongoose.Schema(
  {
    participants: [participantSchema],
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
