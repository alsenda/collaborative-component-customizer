import { expect, test } from "vitest";
import { add } from "../src/add";

/**
 * Asserts that the add utility returns the expected sum.
 */
function assertAdditionWorks(): void {
  expect(add(1, 2)).toBe(3);
}

test("add returns the sum of two numbers", assertAdditionWorks);
