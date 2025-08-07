// <= IMPORTS =>
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";
import {
  getAllSettings,
  updateSettingsSection,
} from "../controllers/settings.controller.js";

// <= ROUTER =>
const router = express.Router();

// <= ROUTES =>
router.get("/", isAuthenticated, getAllSettings);
router.patch("/:section", isAuthenticated, updateSettingsSection);

export default router;
