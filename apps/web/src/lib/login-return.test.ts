import { describe, expect, it } from "vitest";
import { loginHref, loginReturn } from "./login-return";
describe("post-login destination", () => {
  it("preserves supported workspace pages", () => {
    for (const path of ["/documents", "/documents/sample-01", "/requests", "/quality"])
      expect(loginReturn(path)).toBe(path);
    expect(loginHref("/requests")).toBe("/login?next=%2Frequests");
  });
  it("rejects external, encoded, and unsupported destinations", () => {
    for (const path of [
      null,
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/login",
      "/documents/../login",
      "/%2f%2fevil.test",
      "javascript:alert(1)",
    ])
      expect(loginReturn(path)).toBe("/documents");
  });
});
