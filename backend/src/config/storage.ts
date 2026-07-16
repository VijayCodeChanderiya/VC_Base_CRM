import fs from "node:fs";
import path from "node:path";

export const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
export const BACKUPS_DIR = path.resolve(__dirname, "../../backups");

for (const dir of [UPLOADS_DIR, BACKUPS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
