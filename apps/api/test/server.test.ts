import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import type { AtomicDoc, PageDoc } from "@collaborative-component-customizer/shared";
import { buildServer } from "../src/server.js";
import { runMigrations } from "../src/db/runner.js";

const tempDirectories: string[] = [];
const initialApiDbPath = process.env.API_DB_PATH;
const fixtureRoomId = "demo-room";
const fixtureCurrentVersionId = "version-003";

const fixtureAtomicDoc: AtomicDoc = {
  componentId: "component-hero",
  className: "text-4xl"
};

const fixturePageDoc: PageDoc = {
  pageId: "page-home",
  overrides: [
    {
      instanceId: "hero",
      nodeId: "title",
      className: "text-5xl"
    }
  ]
};

async function createTempDbPath(): Promise<string> {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "api-server-"));
  tempDirectories.push(tempDirectory);
  return path.join(tempDirectory, "proof.sqlite");
}

async function setupDatabase(seedStep11Fixture: boolean): Promise<string> {
  const dbFilePath = await createTempDbPath();
  await runMigrations({
    dbFilePath,
    now: () => new Date("2026-02-15T00:00:00.000Z")
  });

  if (!seedStep11Fixture) {
    return dbFilePath;
  }

  const database = new Database(dbFilePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    database
      .prepare("INSERT INTO rooms (room_id, created_at_iso) VALUES (?, ?)")
      .run(fixtureRoomId, "2026-02-15T00:00:00.000Z");

    database
      .prepare(
        "INSERT INTO room_versions (version_id, room_id, parent_version_id, atomic_doc_json, page_doc_json, created_at_iso) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        "version-001",
        fixtureRoomId,
        null,
        JSON.stringify({ componentId: "component-hero", className: "text-xl" }),
        JSON.stringify({ pageId: "page-home", overrides: [] }),
        "2026-02-15T00:01:00.000Z"
      );

    database
      .prepare(
        "INSERT INTO room_versions (version_id, room_id, parent_version_id, atomic_doc_json, page_doc_json, created_at_iso) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        "version-002",
        fixtureRoomId,
        "version-001",
        JSON.stringify({ componentId: "component-hero", className: "text-2xl" }),
        JSON.stringify({ pageId: "page-home", overrides: [] }),
        "2026-02-15T00:02:00.000Z"
      );

    database
      .prepare(
        "INSERT INTO room_versions (version_id, room_id, parent_version_id, atomic_doc_json, page_doc_json, created_at_iso) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        fixtureCurrentVersionId,
        fixtureRoomId,
        "version-002",
        JSON.stringify(fixtureAtomicDoc),
        JSON.stringify(fixturePageDoc),
        "2026-02-15T00:02:00.000Z"
      );

    database
      .prepare(
        "INSERT INTO room_current_docs (room_id, atomic_doc_json, page_doc_json, updated_at_iso) VALUES (?, ?, ?, ?)"
      )
      .run(
        fixtureRoomId,
        JSON.stringify(fixtureAtomicDoc),
        JSON.stringify(fixturePageDoc),
        "2026-02-15T00:02:00.000Z"
      );

    database
      .prepare(
        "INSERT INTO room_current_version (room_id, version_id, updated_at_iso) VALUES (?, ?, ?)"
      )
      .run(fixtureRoomId, fixtureCurrentVersionId, "2026-02-15T00:02:00.000Z");
  } finally {
    database.close();
  }

  return dbFilePath;
}

afterEach(async () => {
  process.env.API_DB_PATH = initialApiDbPath;
  await Promise.all(
    tempDirectories.splice(0).map((tempDirectory) =>
      rm(tempDirectory, { recursive: true, force: true })
    )
  );
});

describe("server migration proof endpoint", () => {
  test("returns applied migration evidence", async () => {
    process.env.API_DB_PATH = await createTempDbPath();

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/migration-proof"
      });

      expect(response.statusCode).toBe(200);

      const payload = response.json() as {
        migrationCount: number;
        appliedVersions: string[];
        newlyAppliedVersions: string[];
        proof: string;
      };

      expect(payload.migrationCount).toBeGreaterThan(0);
      expect(payload.appliedVersions).toContain("0001_initial_schema");
      expect(payload.proof).toBe("backend-migrations-ready");
    } finally {
      await server.close();
    }
  });

  test("bootstraps demo room data consumable by room endpoint", async () => {
    process.env.API_DB_PATH = await createTempDbPath();

    const server = buildServer();

    try {
      const proofResponse = await server.inject({
        method: "GET",
        url: "/migration-proof"
      });

      expect(proofResponse.statusCode).toBe(200);

      const roomResponse = await server.inject({
        method: "GET",
        url: "/rooms/demo-room/current"
      });

      expect(roomResponse.statusCode).toBe(200);
      expect(roomResponse.json()).toEqual({
        roomId: "demo-room",
        currentVersionId: "version-003",
        atomicDoc: {
          componentId: "component-hero",
          className: "text-4xl"
        },
        pageDoc: {
          pageId: "page-home",
          overrides: [
            {
              instanceId: "hero",
              nodeId: "title",
              className: "text-5xl"
            }
          ]
        }
      });
    } finally {
      await server.close();
    }
  });
});

describe("room document and version routes", () => {
  test("returns current room doc snapshot and current version pointer", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/current`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        roomId: fixtureRoomId,
        currentVersionId: fixtureCurrentVersionId,
        atomicDoc: fixtureAtomicDoc,
        pageDoc: fixturePageDoc
      });
    } finally {
      await server.close();
    }
  });

  test("returns 404 when current room snapshot is missing", async () => {
    process.env.API_DB_PATH = await setupDatabase(false);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/rooms/missing-room/current"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NOT_FOUND",
        message: "Room 'missing-room' was not found."
      });
    } finally {
      await server.close();
    }
  });

  test("returns room versions ordered newest first with deterministic tie-break", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/versions`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        roomId: fixtureRoomId,
        versions: [
          {
            versionId: fixtureCurrentVersionId,
            createdAtIso: "2026-02-15T00:02:00.000Z"
          },
          {
            versionId: "version-002",
            createdAtIso: "2026-02-15T00:02:00.000Z"
          },
          {
            versionId: "version-001",
            createdAtIso: "2026-02-15T00:01:00.000Z"
          }
        ]
      });
    } finally {
      await server.close();
    }
  });

  test("returns 404 when listing versions for a missing room", async () => {
    process.env.API_DB_PATH = await setupDatabase(false);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/rooms/missing-room/versions"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NOT_FOUND",
        message: "Room 'missing-room' was not found."
      });
    } finally {
      await server.close();
    }
  });

  test("returns specific version document for a room", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/versions/version-002`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        roomId: fixtureRoomId,
        versionId: "version-002",
        createdAtIso: "2026-02-15T00:02:00.000Z",
        atomicDoc: {
          componentId: "component-hero",
          className: "text-2xl"
        },
        pageDoc: {
          pageId: "page-home",
          overrides: []
        }
      });
    } finally {
      await server.close();
    }
  });

  test("returns 404 when specific version is missing", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/versions/missing-version`
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "NOT_FOUND",
        message: "Version 'missing-version' for room 'demo-room' was not found."
      });
    } finally {
      await server.close();
    }
  });
});
