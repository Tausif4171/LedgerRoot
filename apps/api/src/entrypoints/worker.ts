import { Worker, UnrecoverableError } from "bullmq";
import { ApiError } from "@ledgerroot/contracts";
import { environment } from "../config/env.js";
import { processRun } from "../modules/processing/service.js";
import { logger } from "../infrastructure/logger.js";
const worker = new Worker(
  "ledgerroot-extraction",
  async (job) => {
    try {
      await processRun(String(job.data.runId));
    } catch (e) {
      if (e instanceof ApiError && !e.retryable) throw new UnrecoverableError(e.message);
      throw e;
    }
  },
  {
    connection: { url: environment().REDIS_URL },
    concurrency: 1,
    lockDuration: 240000,
    maxStalledCount: 2,
  },
);
worker.on("failed", (job) => logger.warn({ runId: job?.data.runId }, "Processing attempt failed"));
worker.on("error", () => logger.error("Worker connection failed"));
process.on("SIGTERM", () => void worker.close().then(() => process.exit(0)));
