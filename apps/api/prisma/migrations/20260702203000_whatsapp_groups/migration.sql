CREATE TYPE "WhatsAppProvider" AS ENUM ('CLOUD_API', 'WASSENGER', 'WEBHOOK', 'ASSISTED');

CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'WARNING');

CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phoneNumber" VARCHAR(40),
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'CLOUD_API',
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "phoneNumberId" VARCHAR(120),
    "encryptedCredentials" JSONB,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppGroup" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "externalId" VARCHAR(220) NOT NULL,
    "type" VARCHAR(40) NOT NULL DEFAULT 'GROUP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignWhatsAppGroup" (
    "campaignId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignWhatsAppGroup_pkey" PRIMARY KEY ("campaignId","groupId")
);

ALTER TABLE "ScheduledPost" ADD COLUMN "whatsappGroupId" TEXT;

CREATE UNIQUE INDEX "WhatsAppGroup_connectionId_externalId_key" ON "WhatsAppGroup"("connectionId", "externalId");
CREATE INDEX "WhatsAppGroup_connectionId_idx" ON "WhatsAppGroup"("connectionId");
CREATE INDEX "CampaignWhatsAppGroup_groupId_idx" ON "CampaignWhatsAppGroup"("groupId");
CREATE INDEX "ScheduledPost_whatsappGroupId_idx" ON "ScheduledPost"("whatsappGroupId");

ALTER TABLE "WhatsAppGroup" ADD CONSTRAINT "WhatsAppGroup_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignWhatsAppGroup" ADD CONSTRAINT "CampaignWhatsAppGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignWhatsAppGroup" ADD CONSTRAINT "CampaignWhatsAppGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_whatsappGroupId_fkey" FOREIGN KEY ("whatsappGroupId") REFERENCES "WhatsAppGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
