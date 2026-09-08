import { createApp } from "../app.js";
import { environment } from "../config/env.js";
import { logger } from "../infrastructure/logger.js";
const app = await createApp();
app.listen(environment().PORT, "127.0.0.1", () =>
  logger.info({ port: environment().PORT }, "API listening"),
);
