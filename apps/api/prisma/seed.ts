import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Channel, IntegrationType, MarketplaceKey } from "@prisma/client";
import { defaultMessageTemplates } from "@promopilot/message-templates";

const prisma = new PrismaClient();

async function main() {
  const marketplaces = [
    {
      name: "Natura via Awin",
      key: MarketplaceKey.AWIN,
      integrationType: IntegrationType.FEED,
      baseUrl: "https://www.natura.com.br"
    },
    {
      name: "Shopee",
      key: MarketplaceKey.SHOPEE,
      integrationType: IntegrationType.API,
      baseUrl: "https://shopee.com.br"
    },
    {
      name: "Mercado Livre",
      key: MarketplaceKey.MERCADO_LIVRE,
      integrationType: IntegrationType.ASSISTED,
      baseUrl: "https://www.mercadolivre.com.br"
    },
    {
      name: "Magalu",
      key: MarketplaceKey.MAGALU,
      integrationType: IntegrationType.ASSISTED,
      baseUrl: "https://www.magazineluiza.com.br"
    },
    {
      name: "Manual",
      key: MarketplaceKey.MANUAL,
      integrationType: IntegrationType.MANUAL,
      baseUrl: null
    }
  ];

  for (const marketplace of marketplaces) {
    await prisma.marketplace.upsert({
      where: { key: marketplace.key },
      update: marketplace,
      create: marketplace
    });
  }

  for (const template of defaultMessageTemplates) {
    await prisma.messageTemplate.upsert({
      where: { id: `${template.channel.toLowerCase()}-${slug(template.name)}` },
      update: {
        name: template.name,
        channel: template.channel as Channel,
        content: template.content,
        isDefault: template.isDefault
      },
      create: {
        id: `${template.channel.toLowerCase()}-${slug(template.name)}`,
        name: template.name,
        channel: template.channel as Channel,
        content: template.content,
        isDefault: template.isDefault
      }
    });
  }

  const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@promopilot.local";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "promopilot123";
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Administrador",
      email,
      passwordHash: await bcrypt.hash(password, 12)
    }
  });
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
