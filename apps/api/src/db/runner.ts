import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import type {
  MigrationDefinition,
  MigrationRunResult,
  MigrationStatus,
  RunMigrationsOptions
} from "./types.js";

const migrationFilePattern = /^\d+_.*\.(ts|js)$/;
const migrationsDirectory = new URL("./migrations/", import.meta.url);
const migrationsDirectoryPath = fileURLToPath(migrationsDirectory);

async function discoverMigrations(): Promise<MigrationDefinition[]> {
  const files = await readdir(migrationsDirectoryPath);
  const orderedFiles = files
    .filter((fileName) => migrationFilePattern.test(fileName))
    .sort((left, right) => left.localeCompare(right));

  const migrations: MigrationDefinition[] = [];

  for (const fileName of orderedFiles) {
    const absolutePath = path.join(migrationsDirectoryPath, fileName);
    const migrationModule = (await import(pathToFileURL(absolutePath).href)) as {
      migration: MigrationDefinition;
    };

    migrations.push(migrationModule.migration);
  }

  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();
  for (const migration of migrations) {
    if (seenIds.has(migration.id)) {
      duplicateIds.add(migration.id);
      continue;
    }
    seenIds.add(migration.id);
  }

  if (duplicateIds.size > 0) {
    throw new Error(
      `Duplicate migration IDs found: ${Array.from(duplicateIds).join(", ")}`
    );
  }

  return migrations;
}

function ensureMigrationStateTable(database: Database.Database): void {
  database.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at_iso TEXT NOT NULL,
  rollback_strategy TEXT NOT NULL
);
`);
}

function listAppliedVersions(database: Database.Database): Set<string> {
  const rows = database
    .prepare("SELECT version FROM schema_migrations")
    .all() as Array<{ version: string }>;

  return new Set(rows.map((row) => row.version));
}

export function getMigrationStatus(dbFilePath: string): MigrationStatus {
  const database = new Database(dbFilePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    ensureMigrationStateTable(database);
    const appliedVersions = Array.from(listAppliedVersions(database)).sort(
      (left, right) => left.localeCompare(right)
    );

    return {
      appliedVersions
    };
  } finally {
    database.close();
  }
}

export async function runMigrations(
  options: RunMigrationsOptions
): Promise<MigrationRunResult> {
  const now = options.now ?? (() => new Date());
  const migrations = await discoverMigrations();

  const database = new Database(options.dbFilePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    ensureMigrationStateTable(database);
    const appliedVersions = listAppliedVersions(database);
    const insertMigrationState = database.prepare(`
INSERT INTO schema_migrations (version, applied_at_iso, rollback_strategy)
VALUES (?, ?, ?)
`);

    const newlyAppliedVersions: string[] = [];

    for (const migration of migrations) {
      if (appliedVersions.has(migration.id)) {
        continue;
      }

      database.exec("BEGIN;");

      try {
        database.exec(migration.upSql);
        insertMigrationState.run(
          migration.id,
          now().toISOString(),
          migration.rollbackStrategy
        );
        database.exec("COMMIT;");
        appliedVersions.add(migration.id);
        newlyAppliedVersions.push(migration.id);
      } catch (error) {
        database.exec("ROLLBACK;");
        throw error;
      }
    }

    return {
      appliedVersions: newlyAppliedVersions
    };
  } finally {
    database.close();
  }
}
