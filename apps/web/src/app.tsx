import type { JSX } from "preact";
import {
  applyPatchSequence,
  type EngineDocument,
  type EnginePatchOperation
} from "@collaborative-component-customizer/engine";
import {
  PROTOCOL_VERSION,
  type JoinMessage,
  type RoomId
} from "@collaborative-component-customizer/shared";

/**
 * Renders the initial placeholder UI for the web application.
 */
export function App(): JSX.Element {
  const roomId: RoomId = "demo-room";
  const initialJoin: JoinMessage = {
    protocolVersion: PROTOCOL_VERSION,
    type: "join",
    roomId,
    clientId: "web-client"
  };

  const sampleDocument: EngineDocument = {
    atomicDoc: {
      componentId: "component-header",
      className: "text-sm"
    },
    pageDoc: {
      pageId: "page-home",
      overrides: []
    }
  };

  const sampleOperations: EnginePatchOperation[] = [
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
      className: "text-5xl"
    }
  ];

  const sampleResult = applyPatchSequence(sampleDocument, sampleOperations);

  return (
    <main className="p-4">
      <p>
        collaborative-component-customizer web app scaffold is ready (protocol v
        {initialJoin.protocolVersion}, room {initialJoin.roomId}).
      </p>

      <section className="mt-4">
        <h2>STEP_02 Debug</h2>
        <p>Status: {sampleResult.ok ? "success" : "error"}</p>
        <pre>{JSON.stringify(sampleResult, null, 2)}</pre>
      </section>
    </main>
  );
}
