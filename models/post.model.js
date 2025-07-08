// <= IMPORTS =>
import mongoose from "mongoose";

// <= POST SCHEMA =>
const postSchema = new mongoose.Schema(
  {
    caption: { type: String, default: "" },
    location: { type: String, default: "" },
    image: { type: String, required: true },
    imagePublicId: { type: String, default: "" },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    likes: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  },
  { timestamps: true }
);

// <= EXPORTING THE POST SCHEMA =>
export const Post = mongoose.model("Post", postSchema);
