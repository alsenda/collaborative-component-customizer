import { describe, expect, test } from "vitest";
import { diffClassNames, lintClassName, normalizeClassName } from "./classAnalysis";
import { ClassAnalysisWorkerClient } from "./classAnalysisWorkerClient";
import type { ClassAnalysisWorkerRequest, ClassAnalysisWorkerResponse } from "./workerProtocol";

type WorkerMessageHandler = (event: MessageEvent<ClassAnalysisWorkerResponse>) => void;

class MockWorker {
  private readonly listeners = new Set<WorkerMessageHandler>();

  constructor(private readonly handleRequest: (request: ClassAnalysisWorkerRequest, worker: MockWorker) => void) {}

  postMessage(message: ClassAnalysisWorkerRequest): void {
    this.handleRequest(message, this);
  }

  addEventListener(_type: "message", listener: WorkerMessageHandler): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: WorkerMessageHandler): void {
    this.listeners.delete(listener);
  }

  terminate(): void {
    this.listeners.clear();
  }

  emit(response: ClassAnalysisWorkerResponse): void {
    const event = {
      data: response
    } as MessageEvent<ClassAnalysisWorkerResponse>;

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

describe("class analysis helpers", () => {
  test("normalizes className deterministically", () => {
    expect(normalizeClassName("  text-4xl  font-bold text-4xl  ")).toEqual({
      normalizedClassName: "font-bold text-4xl",
      tokens: ["font-bold", "text-4xl"]
    });
  });

  test("produces deterministic diff summary", () => {
    expect(diffClassNames("text-lg font-semibold", "font-bold text-lg tracking-wide")).toEqual({
      added: ["font-bold", "tracking-wide"],
      removed: ["font-semibold"],
      unchangedCount: 1
    });
  });

  test("returns stable lint issues ordering", () => {
    expect(lintClassName("text-lg text-lg text@bad").issues).toEqual([
      {
        code: "invalid-token",
        message: "invalid class token: text@bad",
        token: "text@bad"
      },
      {
        code: "duplicate-token",
        message: "duplicate class token: text-lg",
        token: "text-lg"
      }
    ]);
  });
});

describe("ClassAnalysisWorkerClient", () => {
  test("handles worker responses and preserves request correlation", async () => {
    const worker = new MockWorker((request, mockWorker) => {
      const delayMs = request.requestId % 2 === 0 ? 1 : 5;

      setTimeout(() => {
        if (request.kind === "normalizeClassName") {
          mockWorker.emit({
            kind: request.kind,
            requestId: request.requestId,
            ok: true,
            payload: normalizeClassName(request.payload.className)
          });
          return;
        }

        if (request.kind === "lintClassName") {
          mockWorker.emit({
            kind: request.kind,
            requestId: request.requestId,
            ok: true,
            payload: lintClassName(request.payload.className)
          });
          return;
        }

        mockWorker.emit({
          kind: request.kind,
          requestId: request.requestId,
          ok: true,
          payload: diffClassNames(request.payload.previousClassName, request.payload.nextClassName)
        });
      }, delayMs);
    });

    const client = new ClassAnalysisWorkerClient(() => worker);

    const firstPromise = client.analyzeClassChange({
      scope: "atomic",
      targetKey: "component-hero-card:title",
      previousClassName: "text-lg",
      nextClassName: "text-4xl font-bold"
    });
    const secondPromise = client.analyzeClassChange({
      scope: "page",
      targetKey: "page-home:instance-hero-primary:title",
      previousClassName: "text-sm",
      nextClassName: "text-sm underline"
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.targetKey).toBe("component-hero-card:title");
    expect(first.source).toBe("worker");
    expect(first.diff).toEqual({
      added: ["font-bold", "text-4xl"],
      removed: ["text-lg"],
      unchangedCount: 0
    });

    expect(second.targetKey).toBe("page-home:instance-hero-primary:title");
    expect(second.source).toBe("worker");
    expect(second.diff).toEqual({
      added: ["underline"],
      removed: [],
      unchangedCount: 1
    });

    client.dispose();
  });

  test("falls back deterministically when worker responses are errors", async () => {
    const worker = new MockWorker((request, mockWorker) => {
      mockWorker.emit({
        kind: request.kind,
        requestId: request.requestId,
        ok: false,
        error: {
          code: "worker-error",
          message: "simulated worker failure"
        }
      });
    });

    const client = new ClassAnalysisWorkerClient(() => worker);
    const snapshot = await client.analyzeClassChange({
      scope: "atomic",
      targetKey: "component-hero-card:title",
      previousClassName: "text-sm",
      nextClassName: "text-sm text-sm"
    });

    expect(snapshot.source).toBe("fallback");
    expect(snapshot.normalized).toEqual({
      normalizedClassName: "text-sm",
      tokens: ["text-sm"]
    });
    expect(snapshot.lint.issues).toEqual([
      {
        code: "duplicate-token",
        message: "duplicate class token: text-sm",
        token: "text-sm"
      }
    ]);
    expect(snapshot.fallbackReason).toBe("simulated worker failure");

    client.dispose();
  });
});
