import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Channel, IntegrationType, MarketplaceKey } from "@prisma/client";

const prisma = new PrismaClient();

const defaultMessageTemplates: Array<{
  name: string;
  channel: Channel;
  isDefault: boolean;
  content: string;
}> = [
  {
    name: "Ofertas 360 - WhatsApp",
    channel: Channel.WHATSAPP,
    isDefault: true,
    content: `OFERTA ENCONTRADA!

{{titulo}}

De: {{preco_anterior}}
Por: {{preco_atual}}
Cupom: {{cupom}}
Avaliacao: {{avaliacao}}
Frete: {{frete}}

Produto bem avaliado
Otimo custo-beneficio
Oferta por tempo limitado

Comprar agora:
{{link_afiliado}}

Preco e disponibilidade podem mudar a qualquer momento.`
  },
  {
    name: "Oferta Relampago",
    channel: Channel.TELEGRAM,
    isDefault: true,
    content: `OFERTA RELAMPAGO!

{{titulo}}

Preco especial: {{preco_atual}}
{{#if cupom}}Use o cupom: {{cupom}}{{/if}}

Garanta aqui:
{{link_afiliado}}

Pode acabar ou alterar o preco sem aviso.`
  },
  {
    name: "Achadinho Fitness",
    channel: Channel.WHATSAPP,
    isDefault: false,
    content: `ACHADINHO FITNESS!

{{titulo}}

Preco: {{preco_atual}}
Avaliacao: {{avaliacao}}
Frete: {{frete}}

Ideal para quem treina, corre ou quer cuidar melhor da saude.

Link da oferta:
{{link_afiliado}}

Consulte disponibilidade antes de finalizar a compra.`
  }
];

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
        channel: template.channel,
        content: template.content,
        isDefault: template.isDefault
      },
      create: {
        id: `${template.channel.toLowerCase()}-${slug(template.name)}`,
        name: template.name,
        channel: template.channel,
        content: template.content,
        isDefault: template.isDefault
      }
    });
  }

  const explicitAdminEmail = process.env.DEFAULT_ADMIN_EMAIL?.trim();
  const explicitAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD?.trim();

  if (process.env.APP_ENV === "production" && (!explicitAdminEmail || !explicitAdminPassword)) {
    await prisma.user.updateMany({
      where: { email: "admin@promopilot.local" },
      data: { isActive: false }
    });
    console.warn("DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set in production.");
    return;
  }

  const email = explicitAdminEmail || "admin@promopilot.local";
  const password = explicitAdminPassword || "promopilot123";
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: explicitAdminPassword
      ? {
          name: "Administrador",
          passwordHash,
          isActive: true
        }
      : {},
    create: {
      name: "Administrador",
      email,
      passwordHash
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
