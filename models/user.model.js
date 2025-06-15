// <= IMPORTS =>
import mongoose from "mongoose";

// <= USER SCHEMA =>
const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePhoto: { type: String, default: "" },
    profilePublicId: { type: String, default: "" },
    bio: { type: String, default: "" },
    gender: { type: String, enum: ["MALE", "FEMALE", "OTHER"], default: "" },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  },
  { timestamps: true }
);

// <= EXPORTING THE USER SCHEMA =>
export const User = mongoose.model("User", userSchema);
