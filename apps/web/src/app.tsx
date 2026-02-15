import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  applyPatchSequence,
  type EngineDocument,
  type EnginePatchOperation
} from "@collaborative-component-customizer/engine";

interface MigrationProofResponse {
  migrationCount: number;
  appliedVersions: string[];
  newlyAppliedVersions: string[];
  proof: "backend-migrations-ready" | "no-migrations";
}

interface CurrentRoomDocResponse {
  roomId: string;
  currentVersionId: string;
  atomicDoc: {
    componentId: string;
    className: string;
  };
  pageDoc: {
    pageId: string;
    overrides: Array<{
      instanceId: string;
      nodeId: string;
      className: string;
    }>;
  };
}

interface Step12DemoResponse {
  transport: string;
  roomId: string;
  messagesSentToConnectionA: number;
  messagesSentToConnectionB: number;
  latestMessage: unknown;
}

interface RealtimeDemoEvent {
  receivedAtIso: string;
  payload: unknown;
}

/**
 * Renders the initial placeholder UI for the web application.
 */
export function App(): JSX.Element {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const sampleRoomId = "demo-room";
  const [migrationProof, setMigrationProof] = useState<
    | { status: "loading" }
    | { status: "success"; value: MigrationProofResponse }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [currentRoomDoc, setCurrentRoomDoc] = useState<
    | { status: "loading" }
    | { status: "success"; value: CurrentRoomDocResponse }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [step12DemoState, setStep12DemoState] = useState<
    | { status: "loading" }
    | { status: "success"; payload: Step12DemoResponse; events: RealtimeDemoEvent[] }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/migration-proof`, {
          signal: controller.signal
        });

        if (!response.ok) {
          setMigrationProof({
            status: "error",
            message: `backend returned ${response.status}`
          });
          return;
        }

        const payload = (await response.json()) as MigrationProofResponse;
        setMigrationProof({ status: "success", value: payload });
      } catch {
        if (!controller.signal.aborted) {
          setMigrationProof({
            status: "error",
            message: "backend proof fetch failed"
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/rooms/${sampleRoomId}/current`, {
          signal: controller.signal
        });

        if (!response.ok) {
          setCurrentRoomDoc({
            status: "error",
            message: `backend returned ${response.status}`
          });
          return;
        }

        const payload = (await response.json()) as CurrentRoomDocResponse;
        setCurrentRoomDoc({ status: "success", value: payload });
      } catch {
        if (!controller.signal.aborted) {
          setCurrentRoomDoc({
            status: "error",
            message: "backend room fetch failed"
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, sampleRoomId]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const runDemoFetch = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/realtime/webtransport/demo-flow`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ roomId: sampleRoomId }),
          signal: controller.signal
        });

        if (!response.ok) {
          setStep12DemoState({
            status: "error",
            message: `backend returned ${response.status}`
          });
          return;
        }

        const payload = (await response.json()) as Step12DemoResponse;

        setStep12DemoState((previousState) => {
          const previousEvents = previousState.status === "success" ? previousState.events : [];
          const nextEvents = [
            ...previousEvents,
            {
              receivedAtIso: new Date().toISOString(),
              payload: payload.latestMessage
            }
          ].slice(-6);

          return {
            status: "success",
            payload,
            events: nextEvents
          };
        });
      } catch {
        if (!controller.signal.aborted) {
          setStep12DemoState({
            status: "error",
            message: "realtime demo request failed"
          });
        }
      }
    };

    void (async () => {
      await runDemoFetch();

      timer = setInterval(() => {
        void runDemoFetch();
      }, 1500);
    })();

    return () => {
      if (timer !== undefined) {
        clearInterval(timer);
      }
      controller.abort();
    };
  }, [apiBaseUrl, sampleRoomId]);

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
      <h1>Progress Dashboard</h1>
      <p>Frontend status view for backend and engine integration progress.</p>

      <section className="mt-4">
        <h2>Engine patch demo</h2>
        <p>Status: {sampleResult.ok ? "success" : "error"}</p>
        <pre>{JSON.stringify(sampleResult, null, 2)}</pre>
      </section>

      <section className="mt-4">
        <h2>SQLite migration status</h2>
        {migrationProof.status === "loading" ? (
          <p>Backend proof: loading...</p>
        ) : null}

        {migrationProof.status === "error" ? (
          <p>Backend proof: error ({migrationProof.message})</p>
        ) : null}

        {migrationProof.status === "success" ? (
          <>
            <p>Status: in progress (backend connected)</p>
            <p>Proof: {migrationProof.value.proof}</p>
            <p>Migrations applied: {migrationProof.value.migrationCount}</p>
            <p>Applied versions: {migrationProof.value.appliedVersions.join(", ")}</p>
          </>
        ) : null}
      </section>

      <section className="mt-4">
        <h2>Room document API</h2>

        {currentRoomDoc.status === "loading" ? (
          <p>Current doc fetch: loading...</p>
        ) : null}

        {currentRoomDoc.status === "error" ? (
          <p>Current doc fetch: error ({currentRoomDoc.message})</p>
        ) : null}

        {currentRoomDoc.status === "success" ? (
          <>
            <p>Status: success</p>
            <pre>{JSON.stringify(currentRoomDoc.value, null, 2)}</pre>
          </>
        ) : null}
      </section>

      <section className="mt-4">
        <h2>Realtime demo</h2>

        {step12DemoState.status === "loading" ? <p>Realtime state: connecting...</p> : null}

        <p>
          WebTransport capability: {"WebTransport" in globalThis ? "available" : "unavailable"}
        </p>
        {!("WebTransport" in globalThis) ? (
          <p>No fallback transport exists in STEP_12.</p>
        ) : null}

        {step12DemoState.status === "error" ? (
          <p>Realtime state: error ({step12DemoState.message})</p>
        ) : null}

        {step12DemoState.status === "success" ? (
          <>
            <p>Realtime state: connected</p>
            <p>Transport: {step12DemoState.payload.transport}</p>
            <p>Status: success</p>
            <pre>{JSON.stringify(step12DemoState.payload.latestMessage, null, 2)}</pre>
            <p>Recent realtime messages:</p>
            <pre>{JSON.stringify(step12DemoState.events, null, 2)}</pre>
          </>
        ) : null}
      </section>
    </main>
  );
}
