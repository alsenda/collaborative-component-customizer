import Fastify, { type FastifyInstance } from "fastify";

/**
 * Builds and configures the Fastify server instance.
 */
export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: false
  });

  server.get("/health", async () => ({ status: "ok" }));

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
