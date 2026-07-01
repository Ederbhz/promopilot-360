import * as cheerio from "cheerio";
import { detectMarketplaceKey, type ProductExtractionResult } from "@promopilot/shared";

const pricePattern = /(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)/;

export async function extractPublicMetadata(url: string): Promise<ProductExtractionResult> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; PromoPilot360/0.1; +https://localhost/promopilot)",
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Nao foi possivel acessar a URL (${response.status})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr("content") ??
    $(`meta[name="${name}"]`).attr("content") ??
    undefined;

  const title =
    meta("og:title") ??
    meta("twitter:title") ??
    $("h1").first().text().trim() ??
    $("title").first().text().trim();

  const description = meta("og:description") ?? meta("description");
  const imageUrl = meta("og:image") ?? meta("twitter:image");
  const priceCandidate =
    meta("product:price:amount") ??
    meta("og:price:amount") ??
    $("[itemprop='price']").first().attr("content") ??
    $("[itemprop='price']").first().text();

  return {
    marketplaceKey: detectMarketplaceKey(url),
    title: sanitizeTitle(title) || "Produto sem titulo identificado",
    description: description?.trim(),
    imageUrl,
    productUrl: url,
    currentPrice: parsePrice(priceCandidate),
    metadata: {
      source: "public-metadata",
      canonicalUrl: $("link[rel='canonical']").attr("href") ?? url
    }
  };
}

export function parsePrice(value?: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.match(pricePattern);
  if (!match?.[1]) return undefined;
  const normalized = match[1].includes(",")
    ? match[1].replace(/\./g, "").replace(",", ".")
    : match[1];
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeTitle(value?: string): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
