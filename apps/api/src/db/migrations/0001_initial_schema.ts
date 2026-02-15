import type { MigrationDefinition } from "../types.js";

export const migration: MigrationDefinition = {
  id: "0001_initial_schema",
  upSql: `
CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  created_at_iso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_current_docs (
  room_id TEXT PRIMARY KEY,
  atomic_doc_json TEXT NOT NULL,
  page_doc_json TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_versions (
  version_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  parent_version_id TEXT,
  atomic_doc_json TEXT NOT NULL,
  page_doc_json TEXT NOT NULL,
  created_at_iso TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_version_id) REFERENCES room_versions(version_id) ON DELETE RESTRICT,
  UNIQUE (room_id, version_id)
);

CREATE TABLE IF NOT EXISTS room_current_version (
  room_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  FOREIGN KEY (room_id, version_id) REFERENCES room_versions(room_id, version_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
  UNIQUE (room_id, version_id)
);
`,
  rollbackStrategy:
    "Irreversible in-place. Roll back by restoring a DB backup from before applying 0001_initial_schema."
};
