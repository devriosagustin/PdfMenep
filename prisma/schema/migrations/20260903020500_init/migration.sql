-- CreateEnum
CREATE TYPE "ToolResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "ToolEvent" (
    "id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "result" "ToolResult" NOT NULL,
    "errorCode" TEXT,
    "inputBytes" INTEGER,
    "outputBytes" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolEvent_tool_createdAt_idx" ON "ToolEvent"("tool", "createdAt");

-- CreateIndex
CREATE INDEX "ToolEvent_createdAt_idx" ON "ToolEvent"("createdAt");
