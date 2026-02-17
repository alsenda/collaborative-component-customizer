import type { ClassDiffResult, ClassLintResult, NormalizedClassNameResult } from "./classAnalysis";

export type ClassAnalysisWorkerRequest =
  | {
    kind: "normalizeClassName";
    requestId: number;
    payload: {
      className: string;
    };
  }
  | {
    kind: "lintClassName";
    requestId: number;
    payload: {
      className: string;
    };
  }
  | {
    kind: "diffClassNames";
    requestId: number;
    payload: {
      previousClassName: string;
      nextClassName: string;
    };
  };

export type ClassAnalysisWorkerSuccessResponse =
  | {
    kind: "normalizeClassName";
    requestId: number;
    ok: true;
    payload: NormalizedClassNameResult;
  }
  | {
    kind: "lintClassName";
    requestId: number;
    ok: true;
    payload: ClassLintResult;
  }
  | {
    kind: "diffClassNames";
    requestId: number;
    ok: true;
    payload: ClassDiffResult;
  };

export interface ClassAnalysisWorkerErrorResponse {
  kind: ClassAnalysisWorkerRequest["kind"];
  requestId: number;
  ok: false;
  error: {
    code: "worker-error" | "timeout" | "worker-unavailable";
    message: string;
  };
}

export type ClassAnalysisWorkerResponse =
  | ClassAnalysisWorkerSuccessResponse
  | ClassAnalysisWorkerErrorResponse;

export interface ClassAnalysisSnapshot {
  scope: "atomic" | "page";
  targetKey: string;
  source: "worker" | "fallback";
  normalized: NormalizedClassNameResult;
  lint: ClassLintResult;
  diff: ClassDiffResult;
  fallbackReason?: string;
}
