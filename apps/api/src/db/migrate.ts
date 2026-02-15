import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runMigrations } from "./runner.js";

const defaultDbFilePath = path.join(process.cwd(), "data", "api.sqlite");
const dbFilePath = process.env.API_DB_PATH ?? defaultDbFilePath;

async function main(): Promise<void> {
  await mkdir(path.dirname(dbFilePath), { recursive: true });

  const result = await runMigrations({
    dbFilePath
  });

  if (result.appliedVersions.length === 0) {
    process.stdout.write("No pending migrations.\n");
    return;
  }

  process.stdout.write(
    `Applied migrations: ${result.appliedVersions.join(", ")}\n`
  );
}

void main();
