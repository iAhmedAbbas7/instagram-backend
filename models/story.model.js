// <= IMPORTS =>
import mongoose from "mongoose";

// <= STORY MEDIA SCHEMA =>
const storyMediaSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 0 },
    url: { type: String, required: true },
    duration: { type: Number, default: 5 },
    publicId: { type: String, default: "" },
    type: { type: String, enum: ["IMAGE", "VIDEO"], required: true },
  },
  { _id: false }
);

// <= STORY SCHEMA =>
const storySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    visibility: {
      type: String,
      enum: ["PUBLIC", "FOLLOWERS", "CLOSE_FRIENDS"],
      default: "FOLLOWERS",
    },
    expiresAt: { type: Date, required: true },
    archived: { type: Boolean, default: false },
    medias: { type: [storyMediaSchema], default: [] },
    hideFrom: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// <= INDEX FOR STORY FOR QUICK ACTIVE STORIES LOOKUP =>
storySchema.index({ owner: 1, expiresAt: 1 });

// <= EXPORTING THE STORY SCHEMA =>
export const Story = mongoose.model("Story", storySchema);
