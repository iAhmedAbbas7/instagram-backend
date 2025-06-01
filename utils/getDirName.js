// <= IMPORTS =>
import path from "path";
import { fileURLToPath } from "url";
// <= NODE JS PATH HELPER FUNCTION =>
export function getDirName(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}
