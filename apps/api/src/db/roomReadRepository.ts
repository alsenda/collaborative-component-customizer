import type {
  AtomicDoc,
  PageDoc,
  PageInstanceOverride,
  RoomId,
  VersionId
} from "@collaborative-component-customizer/shared";
import Database from "better-sqlite3";

export interface CurrentRoomDocResponse {
  roomId: RoomId;
  currentVersionId: VersionId;
  atomicDoc: AtomicDoc;
  pageDoc: PageDoc;
}

export interface RoomVersionSummary {
  versionId: VersionId;
  createdAtIso: string;
}

export interface RoomVersionsResponse {
  roomId: RoomId;
  versions: RoomVersionSummary[];
}

export interface RoomVersionDocResponse {
  roomId: RoomId;
  versionId: VersionId;
  createdAtIso: string;
  atomicDoc: AtomicDoc;
  pageDoc: PageDoc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length < 1 || trimmedValue.length > 128) {
    return null;
  }

  return trimmedValue;
}

function parseAtomicDoc(value: unknown): AtomicDoc | null {
  if (!isRecord(value)) {
    return null;
  }

  const componentId = parseId(value.componentId);
  const className = value.className;

  if (componentId === null || typeof className !== "string" || className.length > 2048) {
    return null;
  }

  return {
    componentId,
    className
  };
}

function parsePageInstanceOverride(value: unknown): PageInstanceOverride | null {
  if (!isRecord(value)) {
    return null;
  }

  const instanceId = parseId(value.instanceId);
  const nodeId = parseId(value.nodeId);
  const className = value.className;

  if (
    instanceId === null ||
    nodeId === null ||
    typeof className !== "string" ||
    className.length > 2048
  ) {
    return null;
  }

  return {
    instanceId,
    nodeId,
    className
  };
}

function parsePageDoc(value: unknown): PageDoc | null {
  if (!isRecord(value)) {
    return null;
  }

  const pageId = parseId(value.pageId);
  const overrides = value.overrides;

  if (pageId === null || !Array.isArray(overrides)) {
    return null;
  }

  const parsedOverrides: PageInstanceOverride[] = [];

  for (const override of overrides) {
    const parsedOverride = parsePageInstanceOverride(override);
    if (parsedOverride === null) {
      return null;
    }
    parsedOverrides.push(parsedOverride);
  }

  return {
    pageId,
    overrides: parsedOverrides
  };
}

function parseJsonObject<T>(
  jsonText: string,
  parseValue: (value: unknown) => T | null
): T | null {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(jsonText) as unknown;
  } catch {
    return null;
  }

  return parseValue(parsedJson);
}

function roomExists(database: Database.Database, roomId: RoomId): boolean {
  const room = database
    .prepare("SELECT room_id FROM rooms WHERE room_id = ?")
    .get(roomId) as { room_id: string } | undefined;

  return room !== undefined;
}

export function getCurrentRoomDoc(
  database: Database.Database,
  roomId: RoomId
): CurrentRoomDocResponse | null {
  const row = database
    .prepare(
      `
SELECT
  room_current_docs.atomic_doc_json,
  room_current_docs.page_doc_json,
  room_current_version.version_id
FROM room_current_docs
INNER JOIN room_current_version
  ON room_current_version.room_id = room_current_docs.room_id
WHERE room_current_docs.room_id = ?
`
    )
    .get(roomId) as
    | {
        atomic_doc_json: string;
        page_doc_json: string;
        version_id: string;
      }
    | undefined;

  if (row === undefined) {
    return null;
  }

  const atomicDoc = parseJsonObject(row.atomic_doc_json, parseAtomicDoc);
  const pageDoc = parseJsonObject(row.page_doc_json, parsePageDoc);
  const currentVersionId = parseId(row.version_id);

  if (atomicDoc === null || pageDoc === null || currentVersionId === null) {
    return null;
  }

  return {
    roomId,
    currentVersionId,
    atomicDoc,
    pageDoc
  };
}

export function listRoomVersions(
  database: Database.Database,
  roomId: RoomId
): RoomVersionsResponse | null {
  if (!roomExists(database, roomId)) {
    return null;
  }

  const rows = database
    .prepare(
      `
SELECT version_id, created_at_iso
FROM room_versions
WHERE room_id = ?
ORDER BY created_at_iso DESC, version_id DESC
`
    )
    .all(roomId) as Array<{ version_id: string; created_at_iso: string }>;

  const versions: RoomVersionSummary[] = [];

  for (const row of rows) {
    const versionId = parseId(row.version_id);
    if (versionId === null || typeof row.created_at_iso !== "string") {
      return null;
    }

    versions.push({
      versionId,
      createdAtIso: row.created_at_iso
    });
  }

  return {
    roomId,
    versions
  };
}

export function getRoomVersionDoc(
  database: Database.Database,
  roomId: RoomId,
  versionId: VersionId
): RoomVersionDocResponse | null {
  const row = database
    .prepare(
      `
SELECT version_id, created_at_iso, atomic_doc_json, page_doc_json
FROM room_versions
WHERE room_id = ? AND version_id = ?
`
    )
    .get(roomId, versionId) as
    | {
        version_id: string;
        created_at_iso: string;
        atomic_doc_json: string;
        page_doc_json: string;
      }
    | undefined;

  if (row === undefined) {
    return null;
  }

  const parsedVersionId = parseId(row.version_id);
  const atomicDoc = parseJsonObject(row.atomic_doc_json, parseAtomicDoc);
  const pageDoc = parseJsonObject(row.page_doc_json, parsePageDoc);

  if (
    parsedVersionId === null ||
    typeof row.created_at_iso !== "string" ||
    atomicDoc === null ||
    pageDoc === null
  ) {
    return null;
  }

  return {
    roomId,
    versionId: parsedVersionId,
    createdAtIso: row.created_at_iso,
    atomicDoc,
    pageDoc
  };
}

export function isValidRouteId(value: unknown): value is string {
  return parseId(value) !== null;
}