import type { JSX } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  applyPatchSequence,
  type EngineDocument,
  type EnginePatchOperation
} from "@collaborative-component-customizer/engine";
import {
  demoComponentTemplates,
  demoWorkspaceInstances,
  resolveRenderableWorkspaceInstances,
  type RenderableWorkspaceInstance
} from "./workspaceTemplates";

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

interface RealtimeTransportDemoResponse {
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

interface LockPresenceDemoResponse {
  roomId: string;
  lockActionResultState: "success";
  latestEvent: unknown;
  events: unknown[];
}

interface SaveVersionResponse {
  roomId: string;
  versionId: string;
  parentVersionId: string | null;
  createdAtIso: string;
  currentVersionId: string;
}

interface ReapplyVersionResponse {
  roomId: string;
  versionId: string;
  parentVersionId: string | null;
  createdAtIso: string;
  currentVersionId: string;
  sourceVersionId: string;
}

type AppRoute = "/workspace" | "/history";

export interface SelectedWorkspaceNode {
  componentId: string;
  instanceId: string;
  nodeId: string;
}

export function formatSelectedNodeProof(selectedNode: SelectedWorkspaceNode | null): string {
  if (selectedNode === null) {
    return "none";
  }

  return JSON.stringify(selectedNode);
}

export function createSelectedWorkspaceNode(
  componentId: string,
  instanceId: string,
  nodeId: string
): SelectedWorkspaceNode {
  return {
    componentId,
    instanceId,
    nodeId
  };
}

export function resolveRoutePath(pathname: string): AppRoute {
  if (pathname === "/history") {
    return "/history";
  }

  return "/workspace";
}

function useAppRoute(initialPath?: string): {
  route: AppRoute;
  navigate: (nextRoute: AppRoute) => void;
} {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (initialPath !== undefined) {
      return resolveRoutePath(initialPath);
    }

    if (typeof window === "undefined") {
      return "/workspace";
    }

    return resolveRoutePath(window.location.pathname);
  });

  useEffect(() => {
    if (initialPath !== undefined || typeof window === "undefined") {
      return;
    }

    const onPopState = () => {
      setRoute(resolveRoutePath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [initialPath]);

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);

    if (typeof window !== "undefined" && window.location.pathname !== nextRoute) {
      window.history.pushState({}, "", nextRoute);
    }
  }, []);

  return { route, navigate };
}

interface AppProps {
  initialPath?: string;
}

/**
 * Renders the frontend shell with route placeholders and existing backend proof sections.
 */
export function App({ initialPath }: AppProps): JSX.Element {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const sampleRoomId = "demo-room";
  const { route, navigate } = useAppRoute(initialPath);
  const renderableWorkspaceInstances = useMemo(
    () => resolveRenderableWorkspaceInstances(demoComponentTemplates, demoWorkspaceInstances),
    []
  );
  const [selectedWorkspaceNode, setSelectedWorkspaceNode] = useState<SelectedWorkspaceNode | null>(
    null
  );
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
    | { status: "success"; payload: RealtimeTransportDemoResponse; events: RealtimeDemoEvent[] }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [step13DemoState, setStep13DemoState] = useState<
    | { status: "loading" }
    | { status: "success"; payload: LockPresenceDemoResponse }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [versioningDemoState, setVersioningDemoState] = useState<
    | { status: "loading" }
    | {
        status: "success";
        payload: {
          save: SaveVersionResponse;
          reapply: ReapplyVersionResponse;
        };
      }
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

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/realtime/webtransport/lock-presence-demo`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ roomId: sampleRoomId }),
          signal: controller.signal
        });

        if (!response.ok) {
          setStep13DemoState({
            status: "error",
            message: `backend returned ${response.status}`
          });
          return;
        }

        const payload = (await response.json()) as LockPresenceDemoResponse;
        setStep13DemoState({ status: "success", payload });
      } catch {
        if (!controller.signal.aborted) {
          setStep13DemoState({
            status: "error",
            message: "lock and presence demo request failed"
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, sampleRoomId]);

  useEffect(() => {
    if (migrationProof.status !== "success") {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const saveResponse = await fetch(`${apiBaseUrl}/rooms/${sampleRoomId}/save`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({}),
          signal: controller.signal
        });

        if (!saveResponse.ok) {
          setVersioningDemoState({
            status: "error",
            message: `save failed (${saveResponse.status})`
          });
          return;
        }

        const savePayload = (await saveResponse.json()) as SaveVersionResponse;

        const reapplyResponse = await fetch(`${apiBaseUrl}/rooms/${sampleRoomId}/reapply`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ versionId: "version-003" }),
          signal: controller.signal
        });

        if (!reapplyResponse.ok) {
          setVersioningDemoState({
            status: "error",
            message: `reapply failed (${reapplyResponse.status})`
          });
          return;
        }

        const reapplyPayload = (await reapplyResponse.json()) as ReapplyVersionResponse;

        setVersioningDemoState({
          status: "success",
          payload: {
            save: savePayload,
            reapply: reapplyPayload
          }
        });
      } catch {
        if (!controller.signal.aborted) {
          setVersioningDemoState({
            status: "error",
            message: "versioning demo request failed"
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, sampleRoomId, migrationProof.status]);

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

        const payload = (await response.json()) as RealtimeTransportDemoResponse;

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

  const sampleResult = useMemo(() => {
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

    return applyPatchSequence(sampleDocument, sampleOperations);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">Customization Platform</h1>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigate("/workspace");
              }}
              className={`rounded border px-3 py-1 text-sm ${route === "/workspace" ? "font-semibold" : ""}`}
            >
              Workspace
            </button>
            <button
              type="button"
              onClick={() => {
                navigate("/history");
              }}
              className={`rounded border px-3 py-1 text-sm ${route === "/history" ? "font-semibold" : ""}`}
            >
              History
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6" role="main">
        {route === "/workspace" ? (
          <section className="space-y-6">
            <WorkspaceRenderer
              instances={renderableWorkspaceInstances}
              selectedNode={selectedWorkspaceNode}
              onSelectNode={(nextSelection) => {
                setSelectedWorkspaceNode(nextSelection);
              }}
            />

            <article className="rounded border p-4">
              <h2 className="text-base font-semibold">Node selection proof</h2>
              <p className="mt-1 text-sm">Selected node: {formatSelectedNodeProof(selectedWorkspaceNode)}</p>
            </article>

            <ProgressDebugDashboard
              migrationProof={migrationProof}
              currentRoomDoc={currentRoomDoc}
              step12DemoState={step12DemoState}
              step13DemoState={step13DemoState}
              versioningDemoState={versioningDemoState}
              sampleResult={sampleResult}
            />
          </section>
        ) : null}

        {route === "/history" ? (
          <section className="rounded border p-4">
            <h2 className="text-base font-semibold">History route placeholder</h2>
            <p className="mt-1 text-sm">
              Version history surface scaffold for upcoming preview and reapply UX steps.
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

interface WorkspaceRendererProps {
  instances: RenderableWorkspaceInstance[];
  selectedNode: SelectedWorkspaceNode | null;
  onSelectNode: (nextSelection: SelectedWorkspaceNode) => void;
}

export function WorkspaceRenderer({
  instances,
  selectedNode,
  onSelectNode
}: WorkspaceRendererProps): JSX.Element {
  return (
    <article className="rounded border p-4">
      <h2 className="text-base font-semibold">Workspace renderer</h2>
      <p className="mt-1 text-sm">Templates render in deterministic order and each node is selectable.</p>

      <div className="mt-4 space-y-4">
        {instances.map((instance) => (
          <section key={instance.instanceId} className="rounded border p-3">
            <h3 className="font-medium">{instance.label}</h3>
            <p className="text-sm">{instance.templateDisplayName}</p>

            <div className="mt-3 space-y-2">
              {instance.nodes.map((node) => {
                const isSelected =
                  selectedNode?.componentId === instance.componentId &&
                  selectedNode.instanceId === instance.instanceId &&
                  selectedNode.nodeId === node.nodeId;

                return (
                  <button
                    key={node.nodeId}
                    type="button"
                    data-selection-key={`${instance.instanceId}:${node.nodeId}`}
                    data-selected={isSelected ? "true" : "false"}
                    className={`w-full rounded border p-2 text-left ${node.baseClassName} ${
                      isSelected ? "border-2 font-semibold" : ""
                    }`}
                    onClick={() => {
                      onSelectNode(
                        createSelectedWorkspaceNode(instance.componentId, instance.instanceId, node.nodeId)
                      );
                    }}
                  >
                    <span className="text-xs">{node.label}</span>
                    <span className="block">{node.text}</span>
                    {isSelected ? <span className="text-xs">Selection overlay active</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

interface ProgressDebugDashboardProps {
  migrationProof:
    | { status: "loading" }
    | { status: "success"; value: MigrationProofResponse }
    | { status: "error"; message: string };
  currentRoomDoc:
    | { status: "loading" }
    | { status: "success"; value: CurrentRoomDocResponse }
    | { status: "error"; message: string };
  step12DemoState:
    | { status: "loading" }
    | { status: "success"; payload: RealtimeTransportDemoResponse; events: RealtimeDemoEvent[] }
    | { status: "error"; message: string };
  step13DemoState:
    | { status: "loading" }
    | { status: "success"; payload: LockPresenceDemoResponse }
    | { status: "error"; message: string };
  versioningDemoState:
    | { status: "loading" }
    | {
        status: "success";
        payload: {
          save: SaveVersionResponse;
          reapply: ReapplyVersionResponse;
        };
      }
    | { status: "error"; message: string };
  sampleResult: ReturnType<typeof applyPatchSequence>;
}

function ProgressDebugDashboard({
  migrationProof,
  currentRoomDoc,
  step12DemoState,
  step13DemoState,
  versioningDemoState,
  sampleResult
}: ProgressDebugDashboardProps): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Integration progress dashboard</h2>
      <p className="text-sm">
        Deterministic backend and engine proof sections remain visible on the workspace route.
      </p>

      <article className="rounded border p-4">
        <h3 className="font-medium">Engine patch demo</h3>
        <p>Status: {sampleResult.ok ? "success" : "error"}</p>
        <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
          {JSON.stringify(sampleResult, null, 2)}
        </pre>
      </article>

      <article className="rounded border p-4">
        <h3 className="font-medium">SQLite migration status</h3>
        {migrationProof.status === "loading" ? <p>Backend proof: loading...</p> : null}

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
      </article>

      <article className="rounded border p-4">
        <h3 className="font-medium">Room document API</h3>

        {currentRoomDoc.status === "loading" ? <p>Current doc fetch: loading...</p> : null}

        {currentRoomDoc.status === "error" ? (
          <p>Current doc fetch: error ({currentRoomDoc.message})</p>
        ) : null}

        {currentRoomDoc.status === "success" ? (
          <>
            <p>Status: success</p>
            <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
              {JSON.stringify(currentRoomDoc.value, null, 2)}
            </pre>
          </>
        ) : null}
      </article>

      <article className="rounded border p-4">
        <h3 className="font-medium">Realtime demo</h3>

        {step12DemoState.status === "loading" ? <p>Realtime state: connecting...</p> : null}

        <p>
          WebTransport capability: {"WebTransport" in globalThis ? "available" : "unavailable"}
        </p>
        {!("WebTransport" in globalThis) ? <p>No fallback transport exists.</p> : null}

        {step12DemoState.status === "error" ? (
          <p>Realtime state: error ({step12DemoState.message})</p>
        ) : null}

        {step12DemoState.status === "success" ? (
          <>
            <p>Realtime state: connected</p>
            <p>Transport: {step12DemoState.payload.transport}</p>
            <p>Status: success</p>
            <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
              {JSON.stringify(step12DemoState.payload.latestMessage, null, 2)}
            </pre>
            <p>Recent realtime messages:</p>
            <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
              {JSON.stringify(step12DemoState.events, null, 2)}
            </pre>
          </>
        ) : null}
      </article>

      <article className="rounded border p-4">
        <h3 className="font-medium">Lock + presence debug</h3>

        {step13DemoState.status === "loading" ? <p>Lock flow state: loading...</p> : null}

        {step13DemoState.status === "error" ? (
          <p>Lock flow state: error ({step13DemoState.message})</p>
        ) : null}

        {step13DemoState.status === "success" ? (
          <>
            <p>Lock action result: {step13DemoState.payload.lockActionResultState}</p>
            <p>Status: success</p>
            <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
              {JSON.stringify(step13DemoState.payload.latestEvent, null, 2)}
            </pre>
            <p>Recent lock/presence messages:</p>
            <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
              {JSON.stringify(step13DemoState.payload.events, null, 2)}
            </pre>
          </>
        ) : null}
      </article>

      <article className="rounded border p-4">
        <h3 className="font-medium">Versioning save + reapply debug</h3>

        {versioningDemoState.status === "loading" ? <p>Versioning flow state: loading...</p> : null}

        {versioningDemoState.status === "error" ? (
          <p>Versioning flow state: error ({versioningDemoState.message})</p>
        ) : null}

        {versioningDemoState.status === "success" ? (
          <>
            <p>Versioning flow state: success</p>
            <p>Save payload:</p>
            <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
              {JSON.stringify(versioningDemoState.payload.save, null, 2)}
            </pre>
            <p>Reapply payload:</p>
            <pre className="mt-2 overflow-x-auto rounded border p-3 text-xs">
              {JSON.stringify(versioningDemoState.payload.reapply, null, 2)}
            </pre>
          </>
        ) : null}
      </article>
    </section>
  );
}
