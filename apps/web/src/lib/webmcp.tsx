"use client";
import { useEffect } from "react";
import { z } from "zod";
import { gateway, isSample } from "@/adapters/gateway";
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
}
export function WebMCP() {
  useEffect(() => {
    if (!isSample) return;
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const tool: Tool = {
      name: "list_sample_documents",
      description:
        "Read the synthetic documents in the current LedgerRoot sample tab. Does not approve or change records.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input) => {
        z.object({}).strict().parse(input);
        return (await gateway.list()).items.map((d) => ({
          id: d.id,
          vendor: d.fields.vendor,
          status: d.reviewStatus,
          provenance: d.extraction?.provenance,
        }));
      },
    };
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {
        /* Optional browser capability; normal UI remains available. */
      });
    } catch {
      /* Unsupported implementation must not break the product. */
    }
    return () => lifecycle.abort();
  }, []);
  return null;
}
