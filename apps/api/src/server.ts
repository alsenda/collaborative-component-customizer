import Fastify, { type FastifyInstance } from "fastify";
import {
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  type LockTarget,
  type ServerMessage
} from "@collaborative-component-customizer/shared";
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
import { RealtimeDispatcher } from "./realtime/dispatcher.js";
import { createWebTransportAdapter } from "./realtime/webTransportAdapter.js";

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
  const realtimeDispatcher = new RealtimeDispatcher({
    getCurrentRoomDoc: (roomId) => {
      const database = new Database(dbFilePath);
      database.exec("PRAGMA foreign_keys = ON;");

      try {
        return getCurrentRoomDoc(database, roomId);
      } finally {
        database.close();
      }
    },
    logEvent: (event) => {
      server.log.info({
        direction: event.direction,
        messageType: event.messageType,
        roomId: event.roomId,
        connectionId: event.connectionId,
        clientId: event.clientId,
        lockTargetKey: event.lockTargetKey
      });
    }
  });
  const webTransportAdapter = createWebTransportAdapter(realtimeDispatcher);

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/realtime/webtransport", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");

    return reply.status(426).send({
      error: "WEBTRANSPORT_UPGRADE_REQUIRED",
      message:
        "This endpoint is reserved for WebTransport (HTTP/3) sessions. WebSocket and other fallbacks are intentionally unavailable."
    });
  });

  const handleRealtimeDemoFlow = async (
    request: {
      body?: unknown;
    },
    reply: {
      header: (name: string, value: string) => void;
      status: (statusCode: number) => { send: (payload: unknown) => unknown };
    }
  ) => {
    reply.header("Access-Control-Allow-Origin", "*");

    const body = request.body as { roomId?: unknown } | null | undefined;
    const roomId = isValidRouteId(body?.roomId) ? body.roomId : "demo-room";
    const sentToA: string[] = [];
    const sentToB: string[] = [];

    const connectionA = webTransportAdapter.connect({
      connectionId: "transport-demo-a",
      sendText: (payload) => {
        sentToA.push(payload);
      }
    });
    const connectionB = webTransportAdapter.connect({
      connectionId: "transport-demo-b",
      sendText: (payload) => {
        sentToB.push(payload);
      }
    });

    connectionA.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "join",
        roomId,
        clientId: "transport-demo-client-a"
      })
    );
    connectionB.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "subscribe",
        roomId
      })
    );
    connectionA.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "patchDraft",
        roomId,
        draftId: "transport-demo-draft-1",
        baseVersionId: "version-003",
        ops: [
          {
            op: "setAtomicClassName",
            componentId: "component-hero",
            className: "text-6xl"
          }
        ]
      })
    );

    connectionA.close();
    connectionB.close();

    const parsePayloads = (payloads: string[]): ServerMessage[] => {
      const parsed: ServerMessage[] = [];

      for (const payload of payloads) {
        const candidate = parseServerMessage(JSON.parse(payload) as unknown);
        if ("code" in candidate) {
          continue;
        }

        parsed.push(candidate);
      }

      return parsed;
    };

    const parsedMessagesToA = parsePayloads(sentToA).filter((message) => message.type !== "presence");
    const parsedMessagesToB = parsePayloads(sentToB).filter((message) => message.type !== "presence");
    const latestMessage = parsedMessagesToB.at(-1) ?? null;

    return reply.status(200).send({
      transport: "webtransport",
      roomId,
      messagesSentToConnectionA: parsedMessagesToA.length,
      messagesSentToConnectionB: parsedMessagesToB.length,
      latestMessage
    });
  };

  server.post("/realtime/webtransport/demo-flow", async (request, reply) =>
    handleRealtimeDemoFlow(request, reply)
  );

  const handleStep13DemoFlow = async (
    request: {
      body?: unknown;
    },
    reply: {
      header: (name: string, value: string) => void;
      status: (statusCode: number) => { send: (payload: unknown) => unknown };
    }
  ) => {
    reply.header("Access-Control-Allow-Origin", "*");

    const body = request.body as { roomId?: unknown } | null | undefined;
    const roomId = isValidRouteId(body?.roomId) ? body.roomId : "demo-room";

    const sentToA: string[] = [];
    const sentToB: string[] = [];
    const atomicTarget: LockTarget = {
      target: "atomic",
      componentId: "component-hero"
    };

    const connectionA = webTransportAdapter.connect({
      connectionId: "lock-presence-demo-a",
      sendText: (payload) => {
        sentToA.push(payload);
      }
    });
    const connectionB = webTransportAdapter.connect({
      connectionId: "lock-presence-demo-b",
      sendText: (payload) => {
        sentToB.push(payload);
      }
    });

    connectionA.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "join",
        roomId,
        clientId: "lock-demo-client-a"
      })
    );
    connectionB.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "join",
        roomId,
        clientId: "lock-demo-client-b"
      })
    );
    connectionA.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "lockAcquire",
        roomId,
        clientId: "lock-demo-client-a",
        lockTarget: atomicTarget
      })
    );
    connectionB.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "lockAcquire",
        roomId,
        clientId: "lock-demo-client-b",
        lockTarget: atomicTarget
      })
    );
    connectionB.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "lockAcquire",
        roomId,
        clientId: "lock-demo-client-b",
        lockTarget: {
          target: "atomic",
          componentId: "missing-component"
        }
      })
    );
    connectionA.receiveText(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "lockReleased",
        roomId,
        clientId: "lock-demo-client-a",
        lockTarget: atomicTarget
      })
    );

    connectionA.close();
    connectionB.close();

    const parsePayloads = (payloads: string[]): ServerMessage[] => {
      const parsed: ServerMessage[] = [];

      for (const payload of payloads) {
        const candidate = parseServerMessage(JSON.parse(payload) as unknown);
        if ("code" in candidate) {
          continue;
        }

        parsed.push(candidate);
      }

      return parsed;
    };

    const parsedFromA = parsePayloads(sentToA);
    const parsedFromB = parsePayloads(sentToB);
    const lockAndPresenceMessages = [...parsedFromA, ...parsedFromB].filter(
      (message) =>
        message.type === "lockGranted" ||
        message.type === "lockDenied" ||
        message.type === "lockReleased" ||
        message.type === "presence"
    );

    const latestEvent = lockAndPresenceMessages.at(-1) ?? null;

    return reply.status(200).send({
      roomId,
      lockActionResultState: "success",
      latestEvent,
      events: lockAndPresenceMessages.slice(-10)
    });
  };

  server.post("/realtime/webtransport/lock-presence-demo", async (request, reply) =>
    handleStep13DemoFlow(request, reply)
  );

  server.options("/realtime/webtransport/demo-flow", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    return reply.status(204).send();
  });

  server.options("/realtime/webtransport/lock-presence-demo", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    return reply.status(204).send();
  });

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
