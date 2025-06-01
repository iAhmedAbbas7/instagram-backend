// <= IMPORTS =>
import { format } from "date-fns";
import { v4 as uuid } from "uuid";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { getDirName } from "../utils/getDirname.js";

// <= DIRNAME =>
const __dirname = getDirName(import.meta.url);

// <= MAIN LOGGER FUNCTION =>
export const logEvents = async (message, logFileName) => {
  // CREATING THE DATE & TIME FORMAT FOR LOG ITEMS
  const dateTime = format(new Date(), "yyyyMMdd\tHH:mm:ss");
  // CREATING THE LOG ITEM
  const logItem = `${dateTime}\t${uuid()}\t${message}\n`;
  try {
    // CHECKING IF THE LOGS DIRECTORY EXISTS
    if (!fs.existsSync(path.join(__dirname, "..", "logs"))) {
      await fsPromises.mkdir(path.join(__dirname, "..", "logs"));
    }
    // APPENDING THE LOG ITEM TO THE LOG FILE
    await fsPromises.appendFile(
      path.join(__dirname, "..", "logs", logFileName),
      logItem
    );
  } catch (err) {
    // CATCHING ERROR
    console.log(err);
  }
};

// LOGGER MIDDLEWARE
export const logger = (req, _res, next) => {
  logEvents(`${req.method}\t${req.url}\t${req.headers.origin}`, "reqLog.log");
  console.log(`${req.method} ${req.path}`);
  next();
};
