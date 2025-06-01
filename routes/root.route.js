// <= IMPORTS =>
import express from "express";
import path from "path";
import { getDirName } from "../utils/getDirName.js";
// <= DIRNAME =>
const __dirname = getDirName(import.meta.url);
// <= ROUTER =>
const router = express.Router();
// <= ROUTE =>
const rootRoute = router.get("^/$|/index(.html)?", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "index.html"));
});

export default rootRoute;
