import { expect, it } from "vitest";
import { uploadFilename } from "./upload-filename.js";
it("preserves UTF-8 metadata and supports legacy upload names", () => {
  expect(uploadFilename("Screenshot 11.44.38\u202fPM – reçu.png", "broken.png")).toBe(
    "Screenshot 11.44.38\u202fPM – reçu.png",
  );
  expect(uploadFilename(undefined, "receipt.png")).toBe("receipt.png");
});
it("rejects malformed filename metadata instead of silently using a fallback", () => {
  for (const value of [null, [], "", "a\n.png", "x".repeat(1025)])
    expect(() => uploadFilename(value, "receipt.png")).toThrow();
});
