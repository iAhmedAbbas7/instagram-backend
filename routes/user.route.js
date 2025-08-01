// <= IMPORTS =>
import express from "express";
import { singleUpload } from "../middleware/multer.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  checkUsernameAvailability,
  deleteAvatar,
  editUserProfile,
  followOrUnfollowUser,
  getSuggestedUsers,
  getUserProfile,
  refreshToken,
  registerUser,
  searchUsers,
  searchUsersInfinite,
  userLogin,
  userLogout,
} from "../controllers/user.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.get("/logout", userLogout);
router.post("/refreshToken", refreshToken);
router.post("/login", authLimiter, userLogin);
router.get("/search", isAuthenticated, searchUsers);
router.post("/register", authLimiter, registerUser);
router.get("/checkUsername", checkUsernameAvailability);
router.get("/:id/profile", isAuthenticated, getUserProfile);
router.delete("/deleteAvatar", isAuthenticated, deleteAvatar);
router.get("/suggestedUsers", isAuthenticated, getSuggestedUsers);
router.get("/searchInfiniteUsers", isAuthenticated, searchUsersInfinite);
router.get("/followOrUnfollow/:id", isAuthenticated, followOrUnfollowUser);
router.post("/profile/edit", isAuthenticated, singleUpload, editUserProfile);

export default router;
