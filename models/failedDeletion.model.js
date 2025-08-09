// <= IMPORTS =>
import mongoose from "mongoose";

// <= FAILED DELETION SCHEMA =>
const failedDeletionSchema = new mongoose.Schema(
  {
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Story",
      default: null,
    },
    resourceType: {
      type: String,
      required: true,
      enum: ["IMAGE", "VIDEO"],
      default: "IMAGE",
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    nextAttemptAt: { type: Date, default: Date.now },
    publicId: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

// <= INDEX TO QUICKLY FIND DUE ITEMS =>
failedDeletionSchema.index({ nextAttemptAt: 1 });

// <= EXPORTING THE FAILED DELETION SCHEMA =>
export const FailedDeletion = mongoose.model(
  "FailedDeletion",
  failedDeletionSchema
);
