// <= DOTENV CONFIGURATION =>
dotenv.config({});

// <= IMPORTS =>
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import rootRoute from "./routes/root.route.js";
import userRoute from "./routes/user.route.js";
import postRoute from "./routes/post.route.js";
import connectDB from "./config/dbConnection.js";
import corsOptions from "./config/corsOptions.js";
import { logEvents } from "./middleware/logger.js";
import { getDirName } from "./utils/getDirName.js";
import { app, server } from "./services/socket.js";
import messageRoute from "./routes/message.route.js";
import settingsRoute from "./routes/settings.route.js";
import { errorHandler } from "./middleware/errorHandler.js";
import helmetMiddleware from "./middleware/helmetMiddleware.js";

// <= DATABASE CONNECTION =>
connectDB();

// <= DIRNAME =>
const __dirname = getDirName(import.meta.url);

// <= PORT =>
const PORT = process.env.PORT || 3000;

// <= MIDDLEWARE> =>
// CORS MIDDLEWARE
app.use(cors(corsOptions));
// JSON MIDDLEWARE
app.use(express.json());
// FORM DATA MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
// COOKIE PARSER MIDDLEWARE
app.use(cookieParser());
// HELMET MIDDLEWARE
app.use(helmetMiddleware());
// STATIC MIDDLEWARE
app.use("/", express.static(path.join(__dirname, "public")));

// <= ROUTES MIDDLEWARE =>
// ROOT ROUTE
app.use("/", rootRoute);
// USER ROUTE
app.use("/api/v1/user", userRoute);
// POST ROUTE
app.use("/api/v1/post", postRoute);
// MESSAGE ROUTE
app.use("/api/v1/message", messageRoute);
// SETTINGS ROUTE
app.use("/api/v1/settings", settingsRoute);

// <= MIDDLEWARE 404 RESPONSE =>
app.all("*", (req, res) => {
  // SETTING STATUS
  res.status(404);
  // RESPONSE HANDLING
  if (req.accepts("html")) {
    // HTML RESPONSE
    res.sendFile(path.join(__dirname, "views", "404.html"));
  } else if (req.accepts("json")) {
    // JSON RESPONSE
    res.json({ message: "404 : Page Not Found" });
  } else {
    // TEXT RESPONSE
    res.type("txt").send("404 : Page Not Found");
  }
});

// <= ERROR HANDLER =>
app.use(errorHandler);

// <= DATABASE & SERVER CONNECTION LISTENER =>
mongoose.connection.once("open", () => {
  console.log("Database Connection Established Successfully");
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});

// <= DATABASE CONNECTION ERROR LISTENER =>
mongoose.connection.on("error", (err) => {
  console.log(err);
  logEvents(
    `${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
    "mongoErrLog.log"
  );
});
