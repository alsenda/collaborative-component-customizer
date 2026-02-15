import { describe, expect, test } from "vitest";
import { render } from "preact-render-to-string";
import { App } from "./app";

describe("App progress dashboard", () => {
  test("displays migration and room API sections and keeps engine output", () => {
    const html = render(<App />);

    expect(html).toContain("Progress Dashboard");
    expect(html).toContain("SQLite migration status");
    expect(html).toContain("Backend proof: loading...");
    expect(html).toContain("Room document API");
    expect(html).toContain("Current doc fetch: loading...");
    expect(html).toContain("Realtime demo");
    expect(html).toContain("Realtime state: connecting...");
    expect(html).toContain("WebTransport capability:");
    expect(html).toContain("Lock + presence debug");
    expect(html).toContain("Lock flow state: loading...");
    expect(html).toContain("Engine patch demo");
    expect(html).toContain("Status: success");
  });
});
