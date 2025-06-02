// <= IMPORTS =>
import express from "express";
import { singleUpload } from "../middleware/multer.js";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  editUserProfile,
  followOrUnfollowUser,
  getSuggestedUsers,
  getUserProfile,
  registerUser,
  userLogin,
  userLogout,
} from "../controllers/user.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.post("/login", userLogin);
router.post("/register", registerUser);
router.get("/logout", isAuthenticated, userLogout);
router.get("/:id/profile", isAuthenticated, getUserProfile);
router.get("/suggestedUsers", isAuthenticated, getSuggestedUsers);
router.post("/followOrUnfollow/:id", isAuthenticated, followOrUnfollowUser);
router.post("/profile/edit", isAuthenticated, singleUpload, editUserProfile);

export default router;
