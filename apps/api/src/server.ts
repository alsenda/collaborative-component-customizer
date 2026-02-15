import Fastify, { type FastifyInstance } from "fastify";
import { parseClientMessage } from "@collaborative-component-customizer/shared";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getMigrationStatus, runMigrations } from "./db/runner.js";

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

  server.get("/step-10/migration-proof", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");

    try {
      await mkdir(path.dirname(dbFilePath), { recursive: true });

      const runResult = await runMigrations({
        dbFilePath
      });
      const status = getMigrationStatus(dbFilePath);

      return reply.status(200).send({
        step: "STEP_10",
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
