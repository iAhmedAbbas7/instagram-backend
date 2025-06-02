// <= IMPORTS =>
import multer from "multer";

// <= CONFIGURING STORAGE =>
const storage = multer.memoryStorage();

// <= HANDLING SINGLE FILE UPLOAD =>
export const singleUpload = multer({ storage }).single("file");
