import Fastify, { type FastifyInstance } from "fastify";
import { parseClientMessage } from "@collaborative-component-customizer/shared";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { getMigrationStatus, runMigrations } from "./db/runner.js";
import { ensureDemoRoomSeed } from "./db/demoRoomSeed.js";
import {
  getCurrentRoomDoc,
  getRoomVersionDoc,
  isValidRouteId,
  listRoomVersions
} from "./db/roomReadRepository.js";

interface ApiErrorPayload {
  error: "NOT_FOUND" | "INVALID_REQUEST";
  message: string;
}

/**
 * Builds and configures the Fastify server instance.
 */
export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: false
  });

  const defaultDbFilePath = path.join(process.cwd(), "data", "api.sqlite");
  const dbFilePath = process.env.API_DB_PATH ?? defaultDbFilePath;

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/migration-proof", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");

    try {
      await mkdir(path.dirname(dbFilePath), { recursive: true });

      const runResult = await runMigrations({
        dbFilePath
      });
      ensureDemoRoomSeed(dbFilePath);
      const status = getMigrationStatus(dbFilePath);

      return reply.status(200).send({
        migrationCount: status.appliedVersions.length,
        appliedVersions: status.appliedVersions,
        newlyAppliedVersions: runResult.appliedVersions,
        proof: status.appliedVersions.length > 0 ? "backend-migrations-ready" : "no-migrations"
      });
    } catch {
      return reply.status(500).send({
        error: "MIGRATION_PROOF_FAILED"
      });
    }
  });

  server.post("/protocol/client-message", async (request, reply) => {
    const parsedMessage = parseClientMessage(request.body);

    if ("code" in parsedMessage) {
      return reply.status(400).send({
        error: parsedMessage.code,
        message: parsedMessage.message,
        issues: parsedMessage.issues,
        supportedProtocolVersion: parsedMessage.supportedProtocolVersion
      });
    }

    return reply.status(200).send({
      accepted: true,
      type: parsedMessage.type
    });
  });

  server.get("/rooms/:roomId/current", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");

    const roomId = (request.params as { roomId?: unknown }).roomId;
    if (!isValidRouteId(roomId)) {
      const payload: ApiErrorPayload = {
        error: "INVALID_REQUEST",
        message: "Invalid roomId parameter."
      };
      return reply.status(400).send(payload);
    }

    const database = new Database(dbFilePath);
    database.exec("PRAGMA foreign_keys = ON;");

    try {
      const currentDoc = getCurrentRoomDoc(database, roomId);
      if (currentDoc === null) {
        const payload: ApiErrorPayload = {
          error: "NOT_FOUND",
          message: `Room '${roomId}' was not found.`
        };
        return reply.status(404).send(payload);
      }

      return reply.status(200).send(currentDoc);
    } catch {
      const payload: ApiErrorPayload = {
        error: "INVALID_REQUEST",
        message: "Failed to load current room document."
      };
      return reply.status(500).send(payload);
    } finally {
      database.close();
    }
  });

  server.get("/rooms/:roomId/versions", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");

    const roomId = (request.params as { roomId?: unknown }).roomId;
    if (!isValidRouteId(roomId)) {
      const payload: ApiErrorPayload = {
        error: "INVALID_REQUEST",
        message: "Invalid roomId parameter."
      };
      return reply.status(400).send(payload);
    }

    const database = new Database(dbFilePath);
    database.exec("PRAGMA foreign_keys = ON;");

    try {
      const versionsPayload = listRoomVersions(database, roomId);
      if (versionsPayload === null) {
        const payload: ApiErrorPayload = {
          error: "NOT_FOUND",
          message: `Room '${roomId}' was not found.`
        };
        return reply.status(404).send(payload);
      }

      return reply.status(200).send(versionsPayload);
    } catch {
      const payload: ApiErrorPayload = {
        error: "INVALID_REQUEST",
        message: "Failed to load room versions."
      };
      return reply.status(500).send(payload);
    } finally {
      database.close();
    }
  });

  server.get("/rooms/:roomId/versions/:versionId", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");

    const params = request.params as {
      roomId?: unknown;
      versionId?: unknown;
    };

    if (!isValidRouteId(params.roomId) || !isValidRouteId(params.versionId)) {
      const payload: ApiErrorPayload = {
        error: "INVALID_REQUEST",
        message: "Invalid roomId or versionId parameter."
      };
      return reply.status(400).send(payload);
    }

    const database = new Database(dbFilePath);
    database.exec("PRAGMA foreign_keys = ON;");

    try {
      const versionPayload = getRoomVersionDoc(database, params.roomId, params.versionId);
      if (versionPayload === null) {
        const payload: ApiErrorPayload = {
          error: "NOT_FOUND",
          message: `Version '${params.versionId}' for room '${params.roomId}' was not found.`
        };
        return reply.status(404).send(payload);
      }

      return reply.status(200).send(versionPayload);
    } catch {
      const payload: ApiErrorPayload = {
        error: "INVALID_REQUEST",
        message: "Failed to load room version document."
      };
      return reply.status(500).send(payload);
    } finally {
      database.close();
    }
  });

  return server;
}

/**
 * Starts the Fastify server on the provided host and port.
 */
export async function startServer(port: number, host: string): Promise<void> {
  const server = buildServer();

  try {
    await server.listen({ port, host });
  } catch (error) {
    server.log.error(error);
    process.exitCode = 1;
  }
}
