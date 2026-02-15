import { randomUUID } from "node:crypto";
import type { RoomId, VersionId } from "@collaborative-component-customizer/shared";
import Database from "better-sqlite3";
import { getCurrentRoomDoc, getRoomVersionDoc } from "./roomReadRepository.js";

export interface VersionMutationResponse {
  roomId: RoomId;
  versionId: VersionId;
  parentVersionId: VersionId | null;
  createdAtIso: string;
  currentVersionId: VersionId;
}

export interface ReapplyVersionResponse extends VersionMutationResponse {
  sourceVersionId: VersionId;
}

export interface VersionMutationOptions {
  now?: () => Date;
  createVersionId?: (createdAtIso: string) => VersionId;
}

function getNow(options: VersionMutationOptions): Date {
  return (options.now ?? (() => new Date()))();
}

function getVersionId(options: VersionMutationOptions, createdAtIso: string): VersionId {
  const createVersionId =
    options.createVersionId ??
    (() => {
      return `version-${randomUUID()}`;
    });

  return createVersionId(createdAtIso);
}

export function saveCurrentRoomAsVersion(
  database: Database.Database,
  roomId: RoomId,
  options: VersionMutationOptions = {}
): VersionMutationResponse | null {
  const currentRoomDoc = getCurrentRoomDoc(database, roomId);
  if (currentRoomDoc === null) {
    return null;
  }

  const createdAtIso = getNow(options).toISOString();
  const versionId = getVersionId(options, createdAtIso);
  const parentVersionId = currentRoomDoc.currentVersionId;
  const atomicDocJson = JSON.stringify(currentRoomDoc.atomicDoc);
  const pageDocJson = JSON.stringify(currentRoomDoc.pageDoc);

  const transaction = database.transaction(() => {
    database
      .prepare(
        "INSERT INTO room_versions (version_id, room_id, parent_version_id, atomic_doc_json, page_doc_json, created_at_iso) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(versionId, roomId, parentVersionId, atomicDocJson, pageDocJson, createdAtIso);

    database
      .prepare(
        "UPDATE room_current_version SET version_id = ?, updated_at_iso = ? WHERE room_id = ?"
      )
      .run(versionId, createdAtIso, roomId);

    database
      .prepare(
        "UPDATE room_current_docs SET atomic_doc_json = ?, page_doc_json = ?, updated_at_iso = ? WHERE room_id = ?"
      )
      .run(atomicDocJson, pageDocJson, createdAtIso, roomId);
  });

  transaction();

  return {
    roomId,
    versionId,
    parentVersionId,
    createdAtIso,
    currentVersionId: versionId
  };
}

export function reapplyRoomVersionAsLatest(
  database: Database.Database,
  roomId: RoomId,
  sourceVersionId: VersionId,
  options: VersionMutationOptions = {}
): ReapplyVersionResponse | null {
  const currentRoomDoc = getCurrentRoomDoc(database, roomId);
  const sourceVersion = getRoomVersionDoc(database, roomId, sourceVersionId);

  if (currentRoomDoc === null || sourceVersion === null) {
    return null;
  }

  const createdAtIso = getNow(options).toISOString();
  const versionId = getVersionId(options, createdAtIso);
  const parentVersionId = currentRoomDoc.currentVersionId;
  const atomicDocJson = JSON.stringify(sourceVersion.atomicDoc);
  const pageDocJson = JSON.stringify(sourceVersion.pageDoc);

  const transaction = database.transaction(() => {
    database
      .prepare(
        "INSERT INTO room_versions (version_id, room_id, parent_version_id, atomic_doc_json, page_doc_json, created_at_iso) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(versionId, roomId, parentVersionId, atomicDocJson, pageDocJson, createdAtIso);

    database
      .prepare(
        "UPDATE room_current_version SET version_id = ?, updated_at_iso = ? WHERE room_id = ?"
      )
      .run(versionId, createdAtIso, roomId);

    database
      .prepare(
        "UPDATE room_current_docs SET atomic_doc_json = ?, page_doc_json = ?, updated_at_iso = ? WHERE room_id = ?"
      )
      .run(atomicDocJson, pageDocJson, createdAtIso, roomId);
  });

  transaction();

  return {
    roomId,
    versionId,
    parentVersionId,
    createdAtIso,
    currentVersionId: versionId,
    sourceVersionId
  };
}