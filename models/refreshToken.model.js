// <= IMPORTS =>
import mongoose from "mongoose";

// <= REFRESH TOKEN SCHEMA =>
const refreshTokenSchema = new mongoose.Schema(
  {
    tokenId: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// <= AUTO DELETING TOKENS WHEN PAST EXPIRATION =>
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// <= EXPORTING THE REFRESH TOKEN SCHEMA =>
export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
