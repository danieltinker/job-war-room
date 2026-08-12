-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('OK', 'EMPTY', 'FAILED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "bestScore" INTEGER,
ADD COLUMN     "scoreDetail" JSONB;

-- AlterTable
ALTER TABLE "ScrapeRun" ADD COLUMN     "companiesScanned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jobsScored" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queriesRun" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SweepSource" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'OK',
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SweepSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SweepSource_runId_idx" ON "SweepSource"("runId");

-- AddForeignKey
ALTER TABLE "SweepSource" ADD CONSTRAINT "SweepSource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

