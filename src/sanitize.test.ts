import { describe, expect, it } from "vitest";
import { sanitizeText } from "./sanitize.js";

describe("sanitizeText", () => {
  it("removes control characters", () => {
    expect(sanitizeText("a\x00b\nc\x7Fd")).toBe("abcd");
  });

  it("truncates to maxLen", () => {
    expect(sanitizeText("abcdef", 3)).toBe("abc");
  });

  it("passes clean short strings through unchanged", () => {
    expect(sanitizeText("Cinemark Centro")).toBe("Cinemark Centro");
  });
});
