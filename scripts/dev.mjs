import { createServer } from "node:net";
import { spawn } from "node:child_process";

const CANDIDATE_PORTS = [3000, 3001, 3002, 3003];

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, "0.0.0.0");
  });
}

async function pickApiPort() {
  for (const port of CANDIDATE_PORTS) {
    const isAvailable = await isPortAvailable(port);
    if (isAvailable) {
      return port;
    }
  }

  throw new Error(`No available API port found in: ${CANDIDATE_PORTS.join(", ")}`);
}

function prefixStream(stream, prefix) {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length > 0) {
        console.log(`[${prefix}] ${line}`);
      }
    }
  });

  stream.on("end", () => {
    if (buffer.length > 0) {
      console.log(`[${prefix}] ${buffer}`);
    }
  });
}

function runWorkspaceDev(prefix, workspaceName, env) {
  const child = spawn(
    "npm",
    ["run", "dev", "--workspace", workspaceName],
    {
      env,
      shell: true,
      stdio: ["inherit", "pipe", "pipe"]
    }
  );

  if (child.stdout) {
    prefixStream(child.stdout, prefix);
  }

  if (child.stderr) {
    prefixStream(child.stderr, prefix);
  }

  return child;
}

async function main() {
  const apiPort = await pickApiPort();
  const apiBaseUrl = `http://localhost:${apiPort}`;

  console.log(`[dev] API_PORT=${apiPort}`);
  console.log(`[dev] VITE_API_BASE_URL=${apiBaseUrl}`);

  const apiProcess = runWorkspaceDev(
    "api",
    "@collaborative-component-customizer/api",
    {
      ...process.env,
      PORT: String(apiPort)
    }
  );

  const webProcess = runWorkspaceDev(
    "web",
    "@collaborative-component-customizer/web",
    {
      ...process.env,
      VITE_API_BASE_URL: apiBaseUrl
    }
  );

  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    apiProcess.kill(signal);
    webProcess.kill(signal);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  apiProcess.on("exit", (code) => {
    if (!shuttingDown) {
      webProcess.kill("SIGTERM");
      process.exit(code ?? 1);
    }
  });

  webProcess.on("exit", (code) => {
    if (!shuttingDown) {
      apiProcess.kill("SIGTERM");
      process.exit(code ?? 1);
    }
  });
}

main().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
