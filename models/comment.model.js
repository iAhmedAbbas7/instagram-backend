// <= IMPORTS =>
import mongoose from "mongoose";

// <= COMMENT SCHEMA =>
const commentSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
  },
  { timestamps: true }
);

// <= EXPORTING THE COMMENT SCHEMA =>
export const Comment = mongoose.model("Comment", commentSchema);
