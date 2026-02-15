import Fastify, { type FastifyInstance } from "fastify";
import { parseClientMessage } from "@collaborative-component-customizer/shared";

/**
 * Builds and configures the Fastify server instance.
 */
export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: false
  });

  server.get("/health", async () => ({ status: "ok" }));

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
