import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/server.js";

const tempDirectories: string[] = [];
const initialApiDbPath = process.env.API_DB_PATH;

async function createTempDbPath(): Promise<string> {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "api-server-"));
  tempDirectories.push(tempDirectory);
  return path.join(tempDirectory, "proof.sqlite");
}

afterEach(async () => {
  process.env.API_DB_PATH = initialApiDbPath;
  await Promise.all(
    tempDirectories.splice(0).map((tempDirectory) =>
      rm(tempDirectory, { recursive: true, force: true })
    )
  );
});

describe("server migration proof endpoint", () => {
  test("returns applied migration evidence for STEP_10", async () => {
    process.env.API_DB_PATH = await createTempDbPath();

    const server = buildServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/step-10/migration-proof"
      });

      expect(response.statusCode).toBe(200);

      const payload = response.json() as {
        step: string;
        migrationCount: number;
        appliedVersions: string[];
        newlyAppliedVersions: string[];
        proof: string;
      };

      expect(payload.step).toBe("STEP_10");
      expect(payload.migrationCount).toBeGreaterThan(0);
      expect(payload.appliedVersions).toContain("0001_initial_schema");
      expect(payload.proof).toBe("backend-migrations-ready");
    } finally {
      await server.close();
    }
  });
});
