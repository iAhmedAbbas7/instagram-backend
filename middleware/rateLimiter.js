// <= IMPORTS =>
import rateLimit from "express-rate-limit";

// <= AUTH ROUTES LIMITER =>
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  message: {
    success: false,
    message: "Too many Attempts, Please try again after 15 Minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// <= GLOBAL RATE LIMITER =>
export const globalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
