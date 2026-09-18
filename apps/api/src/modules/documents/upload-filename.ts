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
// Multipart text fields preserve UTF-8; legacy clients still use the file header.
// Display-name truncation remains in the service. Storage keys never use this name.
export function uploadFilename(metadata: unknown, originalname: string): string {
  return filenameSchema.parse(metadata === undefined ? originalname : metadata);
}
