import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import { runMigrations } from "../src/db/runner.js";

const tempDirectories: string[] = [];

async function createTempDbPath(): Promise<string> {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "api-migrations-"));
  tempDirectories.push(tempDirectory);
  return path.join(tempDirectory, "test.sqlite");
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((tempDirectory) =>
      rm(tempDirectory, { recursive: true, force: true })
    )
  );
});

function getUserTableNames(database: Database.Database): string[] {
  const rows = database.prepare(`
SELECT name
FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`).all() as Array<{ name: string }>;

  return rows.map((row) => row.name);
}

describe("SQLite migrations", () => {
  test("applies initial schema on a fresh database", async () => {
    const dbFilePath = await createTempDbPath();

    const result = await runMigrations({
      dbFilePath,
      now: () => new Date("2026-02-15T00:00:00.000Z")
    });

    expect(result.appliedVersions).toEqual(["0001_initial_schema"]);

    const database = new Database(dbFilePath);
    try {
      const tables = getUserTableNames(database);

      expect(tables).toEqual([
        "room_current_docs",
        "room_current_version",
        "room_versions",
        "rooms",
        "schema_migrations"
      ]);

      const appliedVersions = database
        .prepare(
          "SELECT version, applied_at_iso, rollback_strategy FROM schema_migrations ORDER BY version"
        )
        .all() as Array<{
        version: string;
        applied_at_iso: string;
        rollback_strategy: string;
      }>;

      expect(appliedVersions).toEqual([
        {
          version: "0001_initial_schema",
          applied_at_iso: "2026-02-15T00:00:00.000Z",
          rollback_strategy:
            "Irreversible in-place. Roll back by restoring a DB backup from before applying 0001_initial_schema."
        }
      ]);
    } finally {
      database.close();
    }
  });

  test("re-running migrations is a no-op", async () => {
    const dbFilePath = await createTempDbPath();

    const firstRun = await runMigrations({
      dbFilePath,
      now: () => new Date("2026-02-15T00:00:00.000Z")
    });
    const secondRun = await runMigrations({
      dbFilePath,
      now: () => new Date("2026-02-15T00:01:00.000Z")
    });

    expect(firstRun.appliedVersions).toEqual(["0001_initial_schema"]);
    expect(secondRun.appliedVersions).toEqual([]);

    const database = new Database(dbFilePath);
    try {
      const migrationCountRow = database
        .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
        .get() as { count: number };

      expect(migrationCountRow.count).toBe(1);

      const appliedAt = database
        .prepare("SELECT applied_at_iso FROM schema_migrations WHERE version = ?")
        .get("0001_initial_schema") as { applied_at_iso: string };

      expect(appliedAt.applied_at_iso).toBe("2026-02-15T00:00:00.000Z");
    } finally {
      database.close();
    }
  });

  test("enforces foreign keys and current pointer constraints", async () => {
    const dbFilePath = await createTempDbPath();

    await runMigrations({
      dbFilePath,
      now: () => new Date("2026-02-15T00:00:00.000Z")
    });

    const database = new Database(dbFilePath);
    database.exec("PRAGMA foreign_keys = ON;");

    try {
      database
        .prepare("INSERT INTO rooms (room_id, created_at_iso) VALUES (?, ?)")
        .run("room-a", "2026-02-15T00:00:00.000Z");
      database
        .prepare("INSERT INTO rooms (room_id, created_at_iso) VALUES (?, ?)")
        .run("room-b", "2026-02-15T00:00:00.000Z");

      database
        .prepare(
          "INSERT INTO room_versions (version_id, room_id, parent_version_id, atomic_doc_json, page_doc_json, created_at_iso) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          "version-1",
          "room-a",
          null,
          "{\"componentId\":\"component-a\",\"className\":\"\"}",
          "{\"pageId\":\"page-a\",\"overrides\":[]}",
          "2026-02-15T00:00:00.000Z"
        );

      database
        .prepare(
          "INSERT INTO room_current_version (room_id, version_id, updated_at_iso) VALUES (?, ?, ?)"
        )
        .run("room-a", "version-1", "2026-02-15T00:00:00.000Z");

      expect(() => {
        database
          .prepare(
            "INSERT INTO room_current_version (room_id, version_id, updated_at_iso) VALUES (?, ?, ?)"
          )
          .run("room-b", "version-1", "2026-02-15T00:00:00.000Z");
      }).toThrow();

      expect(() => {
        database
          .prepare(
            "INSERT INTO room_current_docs (room_id, atomic_doc_json, page_doc_json, updated_at_iso) VALUES (?, ?, ?, ?)"
          )
          .run(
            "room-missing",
            "{\"componentId\":\"component-a\",\"className\":\"\"}",
            "{\"pageId\":\"page-a\",\"overrides\":[]}",
            "2026-02-15T00:00:00.000Z"
          );
      }).toThrow();
    } finally {
      database.close();
    }
  });
});
