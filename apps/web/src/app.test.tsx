import { describe, expect, test } from "vitest";
import { render } from "preact-render-to-string";
import { App } from "./app";

describe("App progress dashboard", () => {
  test("displays STEP_10 progress and keeps STEP_02 output", () => {
    const html = render(<App />);

    expect(html).toContain("Progress Dashboard");
    expect(html).toContain("STEP_10 SQLite schema + migrations");
    expect(html).toContain("Backend proof: loading...");
    expect(html).toContain("STEP_02 Engine domain model + tests");
    expect(html).toContain("Status: success");
  });
});
