// <= IMPORTS =>
import mongoose from "mongoose";

// <= STORY VIEW SCHEMA =>
const storyViewSchema = new mongoose.Schema(
  {
    story: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Story",
      required: true,
    },
    viewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    viewedAt: { type: Date, default: Date.now },
    slideIndex: { type: Number, default: null },
  },
  { timestamps: true }
);

// <= INDEX FOR STORY FOR QUICK ACTIVE STORIES LOOKUP =>
storyViewSchema.index({ story: 1, viewer: 1 }, { unique: true });

// <= EXPORTING THE STORY VIEW SCHEMA =>
export const StoryView = mongoose.model("StoryView", storyViewSchema);
