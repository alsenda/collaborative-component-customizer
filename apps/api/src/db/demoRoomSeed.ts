import Database from "better-sqlite3";

const demoRoomId = "demo-room";
const demoVersionId = "version-003";
const demoTimestampIso = "2026-02-15T00:02:00.000Z";

const demoAtomicDoc = {
  componentId: "component-hero",
  className: "text-4xl"
};

const demoPageDoc = {
  pageId: "page-home",
  overrides: [
    {
      instanceId: "hero",
      nodeId: "title",
      className: "text-5xl"
    }
  ]
};

/**
 * Ensures deterministic demo room data exists for the frontend debug dashboard.
 * Safe to call repeatedly.
 */
export function ensureDemoRoomSeed(dbFilePath: string): void {
  const database = new Database(dbFilePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    database
      .prepare("INSERT OR IGNORE INTO rooms (room_id, created_at_iso) VALUES (?, ?)")
      .run(demoRoomId, demoTimestampIso);

    database
      .prepare(
        "INSERT OR IGNORE INTO room_versions (version_id, room_id, parent_version_id, atomic_doc_json, page_doc_json, created_at_iso) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        demoVersionId,
        demoRoomId,
        null,
        JSON.stringify(demoAtomicDoc),
        JSON.stringify(demoPageDoc),
        demoTimestampIso
      );

    database
      .prepare(
        "INSERT OR REPLACE INTO room_current_docs (room_id, atomic_doc_json, page_doc_json, updated_at_iso) VALUES (?, ?, ?, ?)"
      )
      .run(
        demoRoomId,
        JSON.stringify(demoAtomicDoc),
        JSON.stringify(demoPageDoc),
        demoTimestampIso
      );

    database
      .prepare(
        "INSERT OR REPLACE INTO room_current_version (room_id, version_id, updated_at_iso) VALUES (?, ?, ?)"
      )
      .run(demoRoomId, demoVersionId, demoTimestampIso);
  } finally {
    database.close();
  }
}
