import { describe, expect, test } from "vitest";
import { render } from "preact-render-to-string";
import { App, resolveRoutePath } from "./app";

describe("App shell", () => {
  test("renders workspace route by default and keeps debug proof sections visible", () => {
    const html = render(<App initialPath="/" />);

    expect(html).toContain("Customization Platform");
    expect(html).toContain("Workspace route placeholder");
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
    expect(html).not.toContain("Workspace route placeholder");
  });

  test("normalizes unknown routes to workspace", () => {
    expect(resolveRoutePath("/unknown")).toBe("/workspace");
    expect(resolveRoutePath("/history")).toBe("/history");
  });
});
