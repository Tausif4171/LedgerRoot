import { z } from "zod";
import { ApiError } from "@ledgerroot/contracts";
import { readImageInProcess } from "./extraction.js";
process.once("message", async (message: unknown) => {
  try {
    const { image } = z.object({ image: z.string().max(15_000_000) }).parse(message);
    const result = await readImageInProcess(Buffer.from(image, "base64"));
    process.send?.({
      ok: true,
      normalized: result.normalized.toString("base64"),
      spans: result.spans,
    });
  } catch (error) {
    process.send?.({
      ok: false,
      code: error instanceof ApiError ? error.code : "OCR_FAILED",
      message: error instanceof ApiError ? error.message : "The image could not be read.",
      retryable: error instanceof ApiError ? error.retryable : true,
    });
  }
});
