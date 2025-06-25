// <= IMPORTS =>
import express from "express";
import { singleUpload } from "../middleware/multer.js";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  addNewPost,
  bookOrUnBookmarkPost,
  deletePost,
  getAllPosts,
  getPostById,
  getPostComments,
  getPostLikes,
  getUserPosts,
  likeOrUnlikePost,
  postComment,
} from "../controllers/post.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.get("/:id/post", isAuthenticated, getPostById);
router.get("/:id/likes", isAuthenticated, getPostLikes);
router.get("/getAllPosts", isAuthenticated, getAllPosts);
router.get("/allUserPosts", isAuthenticated, getUserPosts);
router.delete("/:id/deletePost", isAuthenticated, deletePost);
router.post("/:id/postComment", isAuthenticated, postComment);
router.get("/:id/allComments", isAuthenticated, getPostComments);
router.get("/likeOrUnlike/:id", isAuthenticated, likeOrUnlikePost);
router.post("/addPost", isAuthenticated, singleUpload, addNewPost);
router.get("/:id/bookOrUnBookmarkPost", isAuthenticated, bookOrUnBookmarkPost);

export default router;
