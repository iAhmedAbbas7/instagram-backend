// <= IMPORTS =>
import express from "express";
import { singleUpload } from "../middleware/multer.js";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  deleteAvatar,
  editUserProfile,
  followOrUnfollowUser,
  getSuggestedUsers,
  getUserProfile,
  registerUser,
  searchUsers,
  userLogin,
  userLogout,
} from "../controllers/user.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.post("/login", userLogin);
router.get("/logout", userLogout);
router.post("/register", registerUser);
router.get("/search", isAuthenticated, searchUsers);
router.get("/:id/profile", isAuthenticated, getUserProfile);
router.delete("/deleteAvatar", isAuthenticated, deleteAvatar);
router.get("/suggestedUsers", isAuthenticated, getSuggestedUsers);
router.get("/followOrUnfollow/:id", isAuthenticated, followOrUnfollowUser);
router.post("/profile/edit", isAuthenticated, singleUpload, editUserProfile);

export default router;
