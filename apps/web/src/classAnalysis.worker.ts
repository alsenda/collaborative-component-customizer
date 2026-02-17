/// <reference lib="webworker" />

import { diffClassNames, lintClassName, normalizeClassName } from "./classAnalysis";
import type {
  ClassAnalysisWorkerErrorResponse,
  ClassAnalysisWorkerRequest,
  ClassAnalysisWorkerResponse
} from "./workerProtocol";

function createWorkerErrorResponse(
  request: ClassAnalysisWorkerRequest,
  message: string
): ClassAnalysisWorkerErrorResponse {
  return {
    kind: request.kind,
    requestId: request.requestId,
    ok: false,
    error: {
      code: "worker-error",
      message
    }
  };
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ClassAnalysisWorkerRequest>) => {
  const request = event.data;

  try {
    let response: ClassAnalysisWorkerResponse;

    switch (request.kind) {
      case "normalizeClassName":
        response = {
          kind: request.kind,
          requestId: request.requestId,
          ok: true,
          payload: normalizeClassName(request.payload.className)
        };
        break;
      case "lintClassName":
        response = {
          kind: request.kind,
          requestId: request.requestId,
          ok: true,
          payload: lintClassName(request.payload.className)
        };
        break;
      case "diffClassNames":
        response = {
          kind: request.kind,
          requestId: request.requestId,
          ok: true,
          payload: diffClassNames(request.payload.previousClassName, request.payload.nextClassName)
        };
        break;
      default:
        response = createWorkerErrorResponse(request, "unsupported request kind");
        break;
    }

    workerScope.postMessage(response);
  } catch {
    workerScope.postMessage(createWorkerErrorResponse(request, "worker request failed"));
  }
};
