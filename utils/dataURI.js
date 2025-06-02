// <= IMPORTS =>
import path from "path";
import DataURIParser from "datauri/parser.js";

// <= DATA URI FUNCTIOn =>
const getDataURI = (file) => {
  const parser = new DataURIParser();
  const extName = path.extname(file.originalname).toString();
  return parser.format(extName, file.buffer);
};

export default getDataURI;
