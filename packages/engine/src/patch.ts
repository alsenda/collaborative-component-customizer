import type { AtomicDoc, PageDoc, PatchOp } from "@collaborative-component-customizer/shared";

export interface EngineDocument {
  atomicDoc: AtomicDoc;
  pageDoc: PageDoc;
}

export type EnginePatchOperation = PatchOp;

export interface EnginePatchApplicationSuccess {
  ok: true;
  value: EngineDocument;
}

export type EnginePatchErrorCode =
  | "INVALID_ATOMIC_TARGET"
  | "INVALID_PAGE_TARGET"
  | "OVERRIDE_NOT_FOUND";

export interface EnginePatchApplicationError {
  ok: false;
  error: {
    code: EnginePatchErrorCode;
    message: string;
    op: EnginePatchOperation;
    opIndex?: number;
  };
}

export type EnginePatchApplicationResult =
  | EnginePatchApplicationSuccess
  | EnginePatchApplicationError;

function cloneDocument(base: EngineDocument): EngineDocument {
  return {
    atomicDoc: {
      componentId: base.atomicDoc.componentId,
      className: base.atomicDoc.className
    },
    pageDoc: {
      pageId: base.pageDoc.pageId,
      overrides: base.pageDoc.overrides.map((override) => ({
        instanceId: override.instanceId,
        nodeId: override.nodeId,
        className: override.className
      }))
    }
  };
}

export function applyPatchOperation(
  base: EngineDocument,
  op: EnginePatchOperation
): EnginePatchApplicationResult {
  const next = cloneDocument(base);

  if (op.op === "setAtomicClassName") {
    if (op.componentId !== next.atomicDoc.componentId) {
      return {
        ok: false,
        error: {
          code: "INVALID_ATOMIC_TARGET",
          message: `Atomic component '${op.componentId}' does not match document component '${next.atomicDoc.componentId}'.`,
          op
        }
      };
    }

    next.atomicDoc.className = op.className;
    return { ok: true, value: next };
  }

  if (op.pageId !== next.pageDoc.pageId) {
    return {
      ok: false,
      error: {
        code: "INVALID_PAGE_TARGET",
        message: `Page '${op.pageId}' does not match document page '${next.pageDoc.pageId}'.`,
        op
      }
    };
  }

  const overrideIndex = next.pageDoc.overrides.findIndex(
    (override) => override.instanceId === op.instanceId && override.nodeId === op.nodeId
  );

  if (op.op === "setPageNodeClassName") {
    if (overrideIndex === -1) {
      next.pageDoc.overrides.push({
        instanceId: op.instanceId,
        nodeId: op.nodeId,
        className: op.className
      });
    } else {
      next.pageDoc.overrides[overrideIndex] = {
        instanceId: op.instanceId,
        nodeId: op.nodeId,
        className: op.className
      };
    }

    return { ok: true, value: next };
  }

  if (overrideIndex === -1) {
    return {
      ok: false,
      error: {
        code: "OVERRIDE_NOT_FOUND",
        message: `Cannot unset override for instance '${op.instanceId}' and node '${op.nodeId}' because it does not exist.`,
        op
      }
    };
  }

  next.pageDoc.overrides.splice(overrideIndex, 1);
  return { ok: true, value: next };
}

export function applyPatchSequence(
  base: EngineDocument,
  ops: readonly EnginePatchOperation[]
): EnginePatchApplicationResult {
  let current = cloneDocument(base);

  for (const [opIndex, op] of ops.entries()) {
    const result = applyPatchOperation(current, op);
    if (!result.ok) {
      return {
        ok: false,
        error: {
          ...result.error,
          opIndex
        }
      };
    }

    current = result.value;
  }

  return {
    ok: true,
    value: current
  };
}