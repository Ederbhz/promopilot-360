export interface TemplateVariableMap {
  titulo?: string;
  preco_atual?: string;
  preco_anterior?: string;
  desconto_percentual?: string;
  cupom?: string;
  marketplace?: string;
  avaliacao?: string;
  frete?: string;
  link_afiliado?: string;
  chamada?: string;
  observacao?: string;
  validade?: string;
  [key: string]: string | undefined;
}

export const defaultMessageTemplates = [
  {
    name: "Ofertas 360 - WhatsApp",
    channel: "WHATSAPP",
    isDefault: true,
    content: `🔥 OFERTA ENCONTRADA!

{{titulo}}

💰 De: {{preco_anterior}}
✅ Por: {{preco_atual}}
🎟️ Cupom: {{cupom}}
⭐ Avaliacao: {{avaliacao}}
🚚 Frete: {{frete}}

✅ Produto bem avaliado
✅ Otimo custo-beneficio
✅ Oferta por tempo limitado

👉 Comprar agora:
{{link_afiliado}}

⚠️ Preco e disponibilidade podem mudar a qualquer momento.`
  },
  {
    name: "Oferta Relampago",
    channel: "TELEGRAM",
    isDefault: true,
    content: `⚡ OFERTA RELAMPAGO!

{{titulo}}

🔥 Preco especial: {{preco_atual}}
{{#if cupom}}🎟️ Use o cupom: {{cupom}}{{/if}}

👉 Garanta aqui:
{{link_afiliado}}

⚠️ Pode acabar ou alterar o preco sem aviso.`
  },
  {
    name: "Achadinho Fitness",
    channel: "WHATSAPP",
    isDefault: false,
    content: `🏃 ACHADINHO FITNESS!

{{titulo}}

💰 Preco: {{preco_atual}}
⭐ Avaliacao: {{avaliacao}}
🚚 Frete: {{frete}}

Ideal para quem treina, corre ou quer cuidar melhor da saude.

👉 Link da oferta:
{{link_afiliado}}

⚠️ Consulte disponibilidade antes de finalizar a compra.`
  }
] as const;

export function renderMessageTemplate(template: string, variables: TemplateVariableMap): string {
  const withConditionals = template.replace(
    /\{\{#if\s+([\w_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, content: string) => (variables[key] ? content : "")
  );

  return withConditionals
    .replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_match, key: string) => {
      const value = variables[key];
      return value && value.trim().length > 0 ? value : "-";
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function formatCurrencyBRL(value?: number | null): string {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function buildTemplateVariables(input: {
  title?: string | null;
  currentPrice?: number | null;
  oldPrice?: number | null;
  discountPercent?: number | null;
  couponCode?: string | null;
  marketplace?: string | null;
  rating?: number | null;
  freeShipping?: boolean | null;
  affiliateUrl?: string | null;
  productUrl?: string | null;
  validUntil?: Date | string | null;
}): TemplateVariableMap {
  return {
    titulo: input.title ?? "Oferta selecionada",
    preco_atual: formatCurrencyBRL(input.currentPrice),
    preco_anterior: formatCurrencyBRL(input.oldPrice),
    desconto_percentual:
      input.discountPercent === undefined || input.discountPercent === null
        ? "-"
        : `${Math.round(input.discountPercent)}%`,
    cupom: input.couponCode ?? "",
    marketplace: input.marketplace ?? "-",
    avaliacao: input.rating ? `${input.rating.toFixed(1)} / 5` : "-",
    frete: input.freeShipping ? "Gratis" : "Consultar",
    link_afiliado: input.affiliateUrl || input.productUrl || "-",
    chamada: "Garimpo inteligente de oferta",
    observacao: "Preco e disponibilidade podem mudar sem aviso.",
    validade: input.validUntil ? new Date(input.validUntil).toLocaleString("pt-BR") : "-"
  };
}
