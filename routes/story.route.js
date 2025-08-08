// <= IMPORTS =>
import express from "express";
import { multipleUpload } from "../middleware/multer.js";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  getActiveStories,
  getStoryHandler,
  getStoryViewers,
  storyViewHandler,
  uploadAndCreateStory,
} from "../controllers/story.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.post(
  "/upload",
  isAuthenticated,
  multipleUpload.array("files", 10),
  uploadAndCreateStory
);
router.get("/tray", isAuthenticated, getActiveStories);
router.get("/:id", isAuthenticated, getStoryHandler);
router.post("/:id/view", isAuthenticated, storyViewHandler);
router.get("/:id/viewers", isAuthenticated, getStoryViewers);
export default router;
