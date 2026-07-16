import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BACKUPS_DIR } from "@/config/storage";

const execFileAsync = promisify(execFile);

async function main() {
  const filename = process.argv[2];
  const confirmed = process.argv.includes("--confirm");

  if (!filename) {
    console.error("Usage: npm run restore -- <backup-filename.sql> --confirm");
    console.error("List available backups with: npm run backup:list");
    process.exit(1);
  }

  const fullPath = path.join(BACKUPS_DIR, path.basename(filename));
  if (!fs.existsSync(fullPath)) {
    console.error(`Backup file not found: ${fullPath}`);
    process.exit(1);
  }

  if (!confirmed) {
    console.error(
      `This will OVERWRITE the current database with the contents of ${filename}.\n` +
        `Re-run with --confirm to proceed: npm run restore -- ${filename} --confirm`
    );
    process.exit(1);
  }

  const psqlPath = process.env.PSQL_PATH;
  const databaseUrl = process.env.DATABASE_URL;
  if (!psqlPath || !databaseUrl) {
    console.error("PSQL_PATH / DATABASE_URL not configured in .env");
    process.exit(1);
  }

  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");

  console.log(`Restoring ${filename} into the database...`);
  await execFileAsync(psqlPath, ["--file", fullPath, url.toString()]);
  console.log("Restore complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
