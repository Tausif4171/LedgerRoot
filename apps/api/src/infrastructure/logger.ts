import pino from "pino";
export const logger = pino({
  name: "ledgerroot",
  redact: ["password", "token", "authorization", "cookie", "document", "ocr", "signedUrl"],
});
