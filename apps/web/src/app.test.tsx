import { describe, expect, test } from "vitest";
import { render } from "preact-render-to-string";
import {
  App,
  createSelectedWorkspaceNode,
  formatSelectedNodeProof,
  resolveRoutePath,
  WorkspaceRenderer
} from "./app";
import {
  demoComponentTemplates,
  demoWorkspaceInstances,
  resolveRenderableWorkspaceInstances
} from "./workspaceTemplates";

describe("App shell", () => {
  test("renders workspace route with renderer and keeps debug proof sections visible", () => {
    const html = render(<App initialPath="/" />);

    expect(html).toContain("Customization Platform");
    expect(html).toContain("Workspace renderer");
    expect(html).toContain("Node selection proof");
    expect(html).toContain("Selected node: none");
    expect(html).toContain("Homepage hero");
    expect(html).toContain("Homepage top banner");
    expect(html).toContain("Integration progress dashboard");
    expect(html).toContain("SQLite migration status");
    expect(html).toContain("Backend proof: loading...");
    expect(html).toContain("Room document API");
    expect(html).toContain("Current doc fetch: loading...");
    expect(html).toContain("Realtime demo");
    expect(html).toContain("Realtime state: connecting...");
    expect(html).toContain("WebTransport capability:");
    expect(html).toContain("Lock + presence debug");
    expect(html).toContain("Lock flow state: loading...");
    expect(html).toContain("Versioning save + reapply debug");
    expect(html).toContain("Versioning flow state: loading...");
    expect(html).toContain("Engine patch demo");
    expect(html).toContain("Status: success");
  });

  test("renders history placeholder route content", () => {
    const html = render(<App initialPath="/history" />);

    expect(html).toContain("Customization Platform");
    expect(html).toContain("History route placeholder");
    expect(html).not.toContain("Workspace renderer");
  });

  test("normalizes unknown routes to workspace", () => {
    expect(resolveRoutePath("/unknown")).toBe("/workspace");
    expect(resolveRoutePath("/history")).toBe("/history");
  });

  test("resolves renderable workspace instances in deterministic order", () => {
    const instances = resolveRenderableWorkspaceInstances(demoComponentTemplates, demoWorkspaceInstances);

    expect(instances.map((instance) => instance.instanceId)).toEqual([
      "instance-hero-primary",
      "instance-marketing-top"
    ]);
  });

  test("renders exactly one selected node overlay when a selection is provided", () => {
    const instances = resolveRenderableWorkspaceInstances(demoComponentTemplates, demoWorkspaceInstances);
    const firstSelection = createSelectedWorkspaceNode(
      "component-hero-card",
      "instance-hero-primary",
      "title"
    );
    const firstHtml = render(
      <WorkspaceRenderer instances={instances} selectedNode={firstSelection} onSelectNode={() => {}} />
    );

    expect((firstHtml.match(/Selection overlay active/g) ?? []).length).toBe(1);
    expect(firstHtml).toContain('data-selection-key="instance-hero-primary:title"');
    expect(firstHtml).toContain('data-selected="true"');

    const secondSelection = createSelectedWorkspaceNode(
      "component-marketing-banner",
      "instance-marketing-top",
      "headline"
    );
    const secondHtml = render(
      <WorkspaceRenderer instances={instances} selectedNode={secondSelection} onSelectNode={() => {}} />
    );

    expect((secondHtml.match(/Selection overlay active/g) ?? []).length).toBe(1);
    expect(secondHtml).toContain('data-selection-key="instance-marketing-top:headline"');
    expect(secondHtml).toContain('data-selected="true"');
  });

  test("formats selection proof payload deterministically", () => {
    expect(formatSelectedNodeProof(null)).toBe("none");
    expect(
      formatSelectedNodeProof(
        createSelectedWorkspaceNode("component-hero-card", "instance-hero-primary", "title")
      )
    ).toBe(
      '{"componentId":"component-hero-card","instanceId":"instance-hero-primary","nodeId":"title"}'
    );
  });
});
