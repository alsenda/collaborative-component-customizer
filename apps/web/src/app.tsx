import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  applyPatchSequence,
  type EngineDocument,
  type EnginePatchOperation
} from "@collaborative-component-customizer/engine";

interface Step10ProofResponse {
  step: "STEP_10";
  migrationCount: number;
  appliedVersions: string[];
  newlyAppliedVersions: string[];
  proof: "backend-migrations-ready" | "no-migrations";
}

/**
 * Renders the initial placeholder UI for the web application.
 */
export function App(): JSX.Element {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const [step10Proof, setStep10Proof] = useState<
    | { status: "loading" }
    | { status: "success"; value: Step10ProofResponse }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/step-10/migration-proof`, {
          signal: controller.signal
        });

        if (!response.ok) {
          setStep10Proof({
            status: "error",
            message: `backend returned ${response.status}`
          });
          return;
        }

        const payload = (await response.json()) as Step10ProofResponse;
        setStep10Proof({ status: "success", value: payload });
      } catch {
        if (!controller.signal.aborted) {
          setStep10Proof({
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
      <p>Frontend status view for plan execution progress.</p>

      <section className="mt-4">
        <h2>STEP_02 Engine domain model + tests</h2>
        <p>Status: {sampleResult.ok ? "success" : "error"}</p>
        <pre>{JSON.stringify(sampleResult, null, 2)}</pre>
      </section>

      <section className="mt-4">
        <h2>STEP_10 SQLite schema + migrations</h2>
        {step10Proof.status === "loading" ? (
          <p>Backend proof: loading...</p>
        ) : null}

        {step10Proof.status === "error" ? (
          <p>Backend proof: error ({step10Proof.message})</p>
        ) : null}

        {step10Proof.status === "success" ? (
          <>
            <p>Status: in progress (backend connected)</p>
            <p>Proof: {step10Proof.value.proof}</p>
            <p>Migrations applied: {step10Proof.value.migrationCount}</p>
            <p>Applied versions: {step10Proof.value.appliedVersions.join(", ")}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
