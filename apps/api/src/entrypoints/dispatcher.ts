import { Queue } from "bullmq";
import { environment } from "../config/env.js";
import { db } from "../infrastructure/database.js";
import { logger } from "../infrastructure/logger.js";
import { dispatchOnce } from "../modules/processing/dispatch.js";
import { recoverOnce } from "../modules/processing/recovery.js";
const queue = new Queue("ledgerroot-extraction", {
  connection: { url: environment().REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: false,
    removeOnFail: false,
  },
});
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
while (!stopped) {
  try {
    await recoverOnce({
      state: async (id) => {
        const job = await queue.getJob(id);
        return job ? job.getState() : "missing";
      },
      removeTerminal: async (id) => {
        const job = await queue.getJob(id);
        if (job && ["failed", "completed"].includes(await job.getState())) await job.remove();
      },
    });
    await dispatchOnce((runId) => queue.add("extract", { runId }, { jobId: runId }));
  } catch {
    logger.warn("Dispatch delayed; durable outbox retained");
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
await queue.close();
await db.$disconnect();
