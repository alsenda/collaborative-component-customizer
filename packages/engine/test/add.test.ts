import { expect, test } from "vitest";
import {
  applyPatchSequence,
  type EngineDocument,
  type EnginePatchOperation
} from "../src/index";

function createBaseDocument(): EngineDocument {
  return {
    atomicDoc: {
      componentId: "component-header",
      className: "text-sm"
    },
    pageDoc: {
      pageId: "page-home",
      overrides: []
    }
  };
}

function createDeterministicOps(): EnginePatchOperation[] {
  return [
    {
      op: "setAtomicClassName",
      componentId: "component-header",
      className: "text-lg font-semibold"
    },
    {
      op: "setPageNodeClassName",
      pageId: "page-home",
      instanceId: "hero",
      nodeId: "title",
      className: "text-4xl"
    },
    {
      op: "setPageNodeClassName",
      pageId: "page-home",
      instanceId: "hero",
      nodeId: "title",
      className: "text-5xl"
    },
    {
      op: "setPageNodeClassName",
      pageId: "page-home",
      instanceId: "hero",
      nodeId: "subtitle",
      className: "opacity-80"
    },
    {
      op: "unsetPageNodeClassName",
      pageId: "page-home",
      instanceId: "hero",
      nodeId: "subtitle"
    }
  ];
}

test("applies valid ordered patch operations to produce expected final document", () => {
  const result = applyPatchSequence(createBaseDocument(), createDeterministicOps());

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }

  expect(result.value).toEqual({
    atomicDoc: {
      componentId: "component-header",
      className: "text-lg font-semibold"
    },
    pageDoc: {
      pageId: "page-home",
      overrides: [
        {
          instanceId: "hero",
          nodeId: "title",
          className: "text-5xl"
        }
      ]
    }
  });
});

test("returns typed error for invalid patch target", () => {
  const invalidOps: EnginePatchOperation[] = [
    {
      op: "setPageNodeClassName",
      pageId: "page-settings",
      instanceId: "hero",
      nodeId: "title",
      className: "text-5xl"
    }
  ];

  const result = applyPatchSequence(createBaseDocument(), invalidOps);

  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }

  expect(result.error).toMatchObject({
    code: "INVALID_PAGE_TARGET",
    opIndex: 0,
    op: invalidOps[0]
  });
});

test("replaying identical input sequence is deterministic", () => {
  const base = createBaseDocument();
  const ops = createDeterministicOps();

  const first = applyPatchSequence(base, ops);
  const second = applyPatchSequence(base, ops);

  expect(first).toEqual(second);
});
