import { diffClassNames, lintClassName, normalizeClassName } from "./classAnalysis";
import type {
  ClassAnalysisSnapshot,
  ClassAnalysisWorkerErrorResponse,
  ClassAnalysisWorkerRequest,
  ClassAnalysisWorkerResponse,
  ClassAnalysisWorkerSuccessResponse
} from "./workerProtocol";

type WorkerMessageHandler = (event: MessageEvent<ClassAnalysisWorkerResponse>) => void;

interface ClassAnalysisWorkerLike {
  postMessage(message: ClassAnalysisWorkerRequest): void;
  addEventListener(type: "message", listener: WorkerMessageHandler): void;
  removeEventListener(type: "message", listener: WorkerMessageHandler): void;
  terminate(): void;
}

export interface AnalysisChangeRequest {
  scope: "atomic" | "page";
  targetKey: string;
  previousClassName: string;
  nextClassName: string;
}

interface PendingRequest {
  resolve: (response: ClassAnalysisWorkerResponse) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  kind: ClassAnalysisWorkerRequest["kind"];
}

const DEFAULT_TIMEOUT_MS = 1200;

function createTimeoutResponse(
  requestId: number,
  kind: ClassAnalysisWorkerRequest["kind"]
): ClassAnalysisWorkerErrorResponse {
  return {
    kind,
    requestId,
    ok: false,
    error: {
      code: "timeout",
      message: "worker request timed out"
    }
  };
}

function createUnavailableResponse(
  requestId: number,
  kind: ClassAnalysisWorkerRequest["kind"],
  message: string
): ClassAnalysisWorkerErrorResponse {
  return {
    kind,
    requestId,
    ok: false,
    error: {
      code: "worker-unavailable",
      message
    }
  };
}

function createWorkerInstance(): ClassAnalysisWorkerLike {
  return new Worker(new URL("./classAnalysis.worker.ts", import.meta.url), {
    type: "module"
  });
}

export class ClassAnalysisWorkerClient {
  private readonly workerFactory: () => ClassAnalysisWorkerLike;
  private worker: ClassAnalysisWorkerLike | null = null;
  private nextRequestId = 1;
  private pendingByRequestId = new Map<number, PendingRequest>();
  private unavailableMessage: string | null = null;

  constructor(workerFactory: () => ClassAnalysisWorkerLike = createWorkerInstance) {
    this.workerFactory = workerFactory;
  }

  private readonly onMessage = (event: MessageEvent<ClassAnalysisWorkerResponse>): void => {
    const response = event.data;
    const pendingRequest = this.pendingByRequestId.get(response.requestId);

    if (pendingRequest === undefined) {
      return;
    }

    clearTimeout(pendingRequest.timeoutHandle);
    this.pendingByRequestId.delete(response.requestId);
    pendingRequest.resolve(response);
  };

  private getOrCreateWorker(): ClassAnalysisWorkerLike | null {
    if (this.worker !== null) {
      return this.worker;
    }

    if (this.unavailableMessage !== null) {
      return null;
    }

    try {
      this.worker = this.workerFactory();
      this.worker.addEventListener("message", this.onMessage);
      return this.worker;
    } catch {
      this.unavailableMessage = "worker bootstrap failed";
      return null;
    }
  }

  private async callWorker<Request extends ClassAnalysisWorkerRequest>(
    request: Omit<Request, "requestId">,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<ClassAnalysisWorkerResponse> {
    const requestId = this.nextRequestId++;
    const workerRequest = {
      ...request,
      requestId
    } as Request;

    const worker = this.getOrCreateWorker();
    if (worker === null) {
      return createUnavailableResponse(
        requestId,
        request.kind,
        this.unavailableMessage ?? "worker unavailable"
      );
    }

    return new Promise<ClassAnalysisWorkerResponse>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingByRequestId.delete(requestId);
        resolve(createTimeoutResponse(requestId, request.kind));
      }, timeoutMs);

      this.pendingByRequestId.set(requestId, {
        resolve,
        timeoutHandle,
        kind: request.kind
      });

      worker.postMessage(workerRequest);
    });
  }

  private extractOrFallback<ResponsePayload>(
    response: ClassAnalysisWorkerResponse,
    expectedKind: ClassAnalysisWorkerRequest["kind"],
    fallback: () => ResponsePayload
  ): {
    payload: ResponsePayload;
    source: "worker" | "fallback";
    fallbackReason?: string;
  } {
    if (response.ok && response.kind === expectedKind) {
      return {
        payload: (response as ClassAnalysisWorkerSuccessResponse).payload as ResponsePayload,
        source: "worker"
      };
    }

    const errorMessage = response.ok
      ? "worker returned unexpected response"
      : response.error.message;

    return {
      payload: fallback(),
      source: "fallback",
      fallbackReason: errorMessage
    };
  }

  async analyzeClassChange(request: AnalysisChangeRequest): Promise<ClassAnalysisSnapshot> {
    const normalizeResponse = await this.callWorker({
      kind: "normalizeClassName",
      payload: {
        className: request.nextClassName
      }
    });

    const lintResponse = await this.callWorker({
      kind: "lintClassName",
      payload: {
        className: request.nextClassName
      }
    });

    const diffResponse = await this.callWorker({
      kind: "diffClassNames",
      payload: {
        previousClassName: request.previousClassName,
        nextClassName: request.nextClassName
      }
    });

    const normalized = this.extractOrFallback(
      normalizeResponse,
      "normalizeClassName",
      () => normalizeClassName(request.nextClassName)
    );
    const lint = this.extractOrFallback(lintResponse, "lintClassName", () =>
      lintClassName(request.nextClassName)
    );
    const diff = this.extractOrFallback(diffResponse, "diffClassNames", () =>
      diffClassNames(request.previousClassName, request.nextClassName)
    );

    const fallbackMessages = [normalized.fallbackReason, lint.fallbackReason, diff.fallbackReason].filter(
      (message): message is string => message !== undefined
    );

    return {
      scope: request.scope,
      targetKey: request.targetKey,
      source:
        normalized.source === "worker" && lint.source === "worker" && diff.source === "worker"
          ? "worker"
          : "fallback",
      normalized: normalized.payload,
      lint: lint.payload,
      diff: diff.payload,
      ...(fallbackMessages.length > 0
        ? {
          fallbackReason: [...new Set(fallbackMessages)].sort().join("; ")
        }
        : {})
    };
  }

  dispose(): void {
    for (const pendingRequest of this.pendingByRequestId.values()) {
      clearTimeout(pendingRequest.timeoutHandle);
      pendingRequest.resolve(
        createUnavailableResponse(0, pendingRequest.kind, "worker disposed before response")
      );
    }

    this.pendingByRequestId.clear();

    if (this.worker !== null) {
      this.worker.removeEventListener("message", this.onMessage);
      this.worker.terminate();
      this.worker = null;
    }
  }
}
