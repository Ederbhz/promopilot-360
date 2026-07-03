ALTER TYPE "WhatsAppProvider" ADD VALUE IF NOT EXISTS 'WPPCONNECT';

ALTER TYPE "WhatsAppConnectionStatus" ADD VALUE IF NOT EXISTS 'WAITING_QR_CODE';
ALTER TYPE "WhatsAppConnectionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "WhatsAppConnectionStatus" ADD VALUE IF NOT EXISTS 'AUTH_ERROR';
ALTER TYPE "WhatsAppConnectionStatus" ADD VALUE IF NOT EXISTS 'ERROR';

ALTER TABLE "WhatsAppConnection"
  ADD COLUMN "sessionName" VARCHAR(120),
  ADD COLUMN "qrCode" TEXT,
  ADD COLUMN "lastConnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dailySentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dailyLimit" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "dailyWindowStartedAt" TIMESTAMP(3),
  ADD COLUMN "minIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "lastSentAt" TIMESTAMP(3);

ALTER TABLE "WhatsAppGroup"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "category" VARCHAR(120),
  ADD COLUMN "minIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "dailyLimit" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "dailySentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dailyWindowStartedAt" TIMESTAMP(3),
  ADD COLUMN "lastSentAt" TIMESTAMP(3),
  ADD COLUMN "notes" TEXT;

CREATE UNIQUE INDEX "WhatsAppConnection_sessionName_key" ON "WhatsAppConnection"("sessionName");

CREATE TABLE "MessageSendLog" (
    "id" TEXT NOT NULL,
    "scheduledPostId" TEXT,
    "campaignId" TEXT,
    "whatsappGroupId" TEXT,
    "whatsappConnectionId" TEXT,
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "status" VARCHAR(40) NOT NULL,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerResponse" JSONB,
    "userResponsible" VARCHAR(180),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageSendLog_campaignId_idx" ON "MessageSendLog"("campaignId");
CREATE INDEX "MessageSendLog_whatsappGroupId_idx" ON "MessageSendLog"("whatsappGroupId");
CREATE INDEX "MessageSendLog_whatsappConnectionId_idx" ON "MessageSendLog"("whatsappConnectionId");
CREATE INDEX "MessageSendLog_status_scheduledAt_idx" ON "MessageSendLog"("status", "scheduledAt");

ALTER TABLE "MessageSendLog" ADD CONSTRAINT "MessageSendLog_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageSendLog" ADD CONSTRAINT "MessageSendLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageSendLog" ADD CONSTRAINT "MessageSendLog_whatsappGroupId_fkey" FOREIGN KEY ("whatsappGroupId") REFERENCES "WhatsAppGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageSendLog" ADD CONSTRAINT "MessageSendLog_whatsappConnectionId_fkey" FOREIGN KEY ("whatsappConnectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
