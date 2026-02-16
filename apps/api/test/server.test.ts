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

async function setupDatabase(seedRoomFixtureData: boolean): Promise<string> {
  const dbFilePath = await createTempDbPath();
  await runMigrations({
    dbFilePath,
    now: () => new Date("2026-02-15T00:00:00.000Z")
  });

  if (!seedRoomFixtureData) {
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

function createVersionIdFactory(prefix: string): (createdAtIso: string) => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter.toString().padStart(3, "0")}`;
  };
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

  test("save creates a new immutable version and updates the current pointer", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer({
      versionMutation: {
        now: () => new Date("2026-02-15T10:00:00.000Z"),
        createVersionId: createVersionIdFactory("version-save")
      }
    });

    try {
      const saveResponse = await server.inject({
        method: "POST",
        url: `/rooms/${fixtureRoomId}/save`,
        payload: {}
      });

      expect(saveResponse.statusCode).toBe(200);
      expect(saveResponse.json()).toEqual({
        roomId: fixtureRoomId,
        versionId: "version-save-001",
        parentVersionId: fixtureCurrentVersionId,
        createdAtIso: "2026-02-15T10:00:00.000Z",
        currentVersionId: "version-save-001"
      });

      const currentResponse = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/current`
      });

      expect(currentResponse.statusCode).toBe(200);
      expect(currentResponse.json()).toMatchObject({
        roomId: fixtureRoomId,
        currentVersionId: "version-save-001"
      });

      const versionsResponse = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/versions`
      });

      expect(versionsResponse.statusCode).toBe(200);
      expect(versionsResponse.json()).toEqual({
        roomId: fixtureRoomId,
        versions: [
          {
            versionId: "version-save-001",
            createdAtIso: "2026-02-15T10:00:00.000Z"
          },
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

  test("reapply creates a new latest version from historical content without rewriting history", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer({
      versionMutation: {
        now: () => new Date("2026-02-15T11:00:00.000Z"),
        createVersionId: createVersionIdFactory("version-reapply")
      }
    });

    try {
      const reapplyResponse = await server.inject({
        method: "POST",
        url: `/rooms/${fixtureRoomId}/reapply`,
        payload: {
          versionId: "version-001"
        }
      });

      expect(reapplyResponse.statusCode).toBe(200);
      expect(reapplyResponse.json()).toEqual({
        roomId: fixtureRoomId,
        versionId: "version-reapply-001",
        parentVersionId: fixtureCurrentVersionId,
        createdAtIso: "2026-02-15T11:00:00.000Z",
        currentVersionId: "version-reapply-001",
        sourceVersionId: "version-001"
      });

      const currentResponse = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/current`
      });

      expect(currentResponse.statusCode).toBe(200);
      expect(currentResponse.json()).toEqual({
        roomId: fixtureRoomId,
        currentVersionId: "version-reapply-001",
        atomicDoc: {
          componentId: "component-hero",
          className: "text-xl"
        },
        pageDoc: {
          pageId: "page-home",
          overrides: []
        }
      });

      const versionsResponse = await server.inject({
        method: "GET",
        url: `/rooms/${fixtureRoomId}/versions`
      });

      const versionsPayload = versionsResponse.json() as {
        roomId: string;
        versions: Array<{ versionId: string; createdAtIso: string }>;
      };

      expect(versionsResponse.statusCode).toBe(200);
      expect(versionsPayload.roomId).toBe(fixtureRoomId);
      expect(versionsPayload.versions).toHaveLength(4);
      expect(versionsPayload.versions[0]).toEqual({
        versionId: "version-reapply-001",
        createdAtIso: "2026-02-15T11:00:00.000Z"
      });
      expect(versionsPayload.versions.map((entry) => entry.versionId)).toEqual([
        "version-reapply-001",
        fixtureCurrentVersionId,
        "version-002",
        "version-001"
      ]);
    } finally {
      await server.close();
    }
  });

  test("returns 404 when saving a missing room", async () => {
    process.env.API_DB_PATH = await setupDatabase(false);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/rooms/missing-room/save",
        payload: {}
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

  test("returns 404 when reapplying a missing version", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: `/rooms/${fixtureRoomId}/reapply`,
        payload: {
          versionId: "missing-version"
        }
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

  test("returns 400 for invalid save route params", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/rooms/%20/save",
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "INVALID_REQUEST",
        message: "Invalid roomId parameter."
      });
    } finally {
      await server.close();
    }
  });

  test("returns 400 for invalid reapply body", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: `/rooms/${fixtureRoomId}/reapply`,
        payload: {
          versionId: ""
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "INVALID_REQUEST",
        message: "Invalid versionId in request body."
      });
    } finally {
      await server.close();
    }
  });
});

describe("realtime routes", () => {
  test("exposes webtransport endpoint with explicit no-fallback response", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/realtime/webtransport"
      });

      expect(response.statusCode).toBe(426);
      expect(response.json()).toEqual({
        error: "WEBTRANSPORT_UPGRADE_REQUIRED",
        message:
          "This endpoint is reserved for WebTransport (HTTP/3) sessions. WebSocket and other fallbacks are intentionally unavailable."
      });
    } finally {
      await server.close();
    }
  });

  test("demo flow returns latest typed patchDraft message from backend dispatcher", async () => {
    process.env.API_DB_PATH = await setupDatabase(true);

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/realtime/webtransport/demo-flow",
        payload: {
          roomId: fixtureRoomId
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        transport: "webtransport",
        roomId: fixtureRoomId,
        messagesSentToConnectionA: 1,
        messagesSentToConnectionB: 2,
        latestMessage: {
          protocolVersion: 1,
          type: "patchDraft",
          roomId: fixtureRoomId,
          draftId: "transport-demo-draft-1",
          baseVersionId: "version-003",
          authorClientId: "transport-demo-client-a",
          ops: [
            {
              op: "setAtomicClassName",
              componentId: "component-hero",
              className: "text-6xl"
            }
          ]
        }
      });
    } finally {
      await server.close();
    }
  });

});
