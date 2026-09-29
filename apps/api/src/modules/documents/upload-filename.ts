import { z } from "zod";

const filenameSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !Array.from(value).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ),
    "Filename must not contain control characters.",
  );
// Multer's file-header fallback is Latin-1, while browsers send UTF-8 bytes.
// Do not decode explicit metadata: multipart text fields already preserve UTF-8.
export function decodeFilenameHeader(originalname: string): string {
  if (Array.from(originalname).some((character) => character.charCodeAt(0) > 255))
    return originalname;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(originalname, "latin1"),
    );
  } catch {
    // Older non-UTF-8 clients may send genuine Latin-1 names.
    return originalname;
  }
}

// Display-name truncation remains in the service. Storage keys never use this name.
export function uploadFilename(metadata: unknown, originalname: string): string {
  return filenameSchema.parse(
    metadata === undefined ? decodeFilenameHeader(originalname) : metadata,
  );
}
