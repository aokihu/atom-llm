import { describe, expect, test } from "bun:test";
import { parseJsonArguments } from "../src/tools/json-args";

describe("parseJsonArguments", () => {
  test("treats empty input as empty object", () => {
    expect(parseJsonArguments("   ")).toEqual({ ok: true, value: {} });
  });

  test("parses valid json", () => {
    expect(parseJsonArguments('{"path":"README.md"}')).toEqual({
      ok: true,
      value: { path: "README.md" },
    });
  });

  test("returns error for malformed json", () => {
    const result = parseJsonArguments("[1,");
    expect(result.ok).toBe(false);
  });
});
