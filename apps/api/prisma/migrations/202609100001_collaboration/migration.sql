-- Stop API/dispatcher/workers and back up the database before applying.
-- No original object is moved, copied, or deleted by this migration.
CREATE TABLE "SourceRevision" (
  "id" TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "Document"("id"),
  "workspaceId" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "filename" TEXT NOT NULL, "checksum" TEXT NOT NULL, "objectKey" TEXT NOT NULL,
  "mime" TEXT NOT NULL, "bytes" INTEGER NOT NULL, "uploaderId" TEXT, "uploaderName" TEXT,
  "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SourceRevision_objectKey_key" ON "SourceRevision"("objectKey");
CREATE UNIQUE INDEX "SourceRevision_documentId_version_key" ON "SourceRevision"("documentId","version");
CREATE UNIQUE INDEX "SourceRevision_workspaceId_checksum_key" ON "SourceRevision"("workspaceId","checksum");
ALTER TABLE "Document" ADD COLUMN "currentSourceId" TEXT;
ALTER TABLE "ProcessingRun" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "ReviewRevision" ADD COLUMN "sourceId" TEXT;
INSERT INTO "SourceRevision" ("id","documentId","workspaceId","version","filename","checksum","objectKey","mime","bytes","reason","createdAt")
SELECT 'initial-' || "id", "id", "workspaceId", 1, "filename", "checksum", "objectKey", "mime", "bytes", 'Original upload; uploader not recorded', "createdAt" FROM "Document";
UPDATE "Document" SET "currentSourceId" = 'initial-' || "id";
UPDATE "ProcessingRun" SET "sourceId" = 'initial-' || "documentId";
UPDATE "ReviewRevision" SET "sourceId" = 'initial-' || "documentId";
ALTER TABLE "Document" ALTER COLUMN "currentSourceId" SET NOT NULL;
ALTER TABLE "ProcessingRun" ALTER COLUMN "sourceId" SET NOT NULL;
ALTER TABLE "ReviewRevision" ALTER COLUMN "sourceId" SET NOT NULL;
-- Deferred constraints allow initial document + source creation in one transaction.
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentSourceId_fkey" FOREIGN KEY ("currentSourceId") REFERENCES "SourceRevision"("id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ProcessingRun" ADD CONSTRAINT "ProcessingRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceRevision"("id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceRevision"("id") DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE "CorrectionRequest" (
  "id" TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "Document"("id"),
  "sourceId" TEXT NOT NULL REFERENCES "SourceRevision"("id"), "assigneeId" TEXT NOT NULL,
  "question" TEXT NOT NULL, "field" TEXT, "state" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("state" IN ('OPEN','RESPONDED','RESOLVED','CANCELED')),
  "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CorrectionRequest_one_active" ON "CorrectionRequest"("documentId") WHERE "state" IN ('OPEN','RESPONDED');
CREATE INDEX "CorrectionRequest_documentId_state_idx" ON "CorrectionRequest"("documentId","state");
CREATE INDEX "CorrectionRequest_assigneeId_state_id_idx" ON "CorrectionRequest"("assigneeId","state","id");
CREATE TABLE "RequestEvent" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "CorrectionRequest"("id"),
  "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL, "action" TEXT NOT NULL, "message" TEXT NOT NULL,
  "sourceId" TEXT REFERENCES "SourceRevision"("id"), "assigneeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RequestEvent_requestId_createdAt_id_idx" ON "RequestEvent"("requestId","createdAt","id");
