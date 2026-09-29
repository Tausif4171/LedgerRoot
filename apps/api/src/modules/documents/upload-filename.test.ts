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

it("decodes browser UTF-8 filenames from Latin-1 multipart headers", () => {
  for (const name of ["Screenshot 8\u202fPM.png", "reçu – 東京.png", "receipt.png"])
    expect(uploadFilename(undefined, Buffer.from(name, "utf8").toString("latin1"))).toBe(name);
});

it("preserves explicit metadata, genuine Latin-1 and already decoded Unicode", () => {
  expect(uploadFilename(undefined, "reçu.png")).toBe("reçu.png");
  expect(uploadFilename(undefined, "東京.png")).toBe("東京.png");
  expect(uploadFilename("Ã©.png", "ignored.png")).toBe("Ã©.png");
  expect(() => uploadFilename(undefined, "receipt\n.png")).toThrow();
});
