import { z } from "zod";

export const marketplaceTypes = [
  "AWIN",
  "SHOPEE",
  "MERCADO_LIVRE",
  "MAGALU",
  "MANUAL"
] as const;

export const integrationTypes = ["API", "FEED", "MANUAL", "ASSISTED"] as const;
export const campaignStatuses = ["ACTIVE", "PAUSED", "ENDED"] as const;
export const channels = ["TELEGRAM", "WHATSAPP", "INSTAGRAM", "MANUAL"] as const;

export const offerStatuses = [
  "DRAFT",
  "VALIDATING",
  "VALID",
  "INVALID",
  "EXPIRED",
  "AFFILIATE_LINK_MISSING",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
  "PAUSED"
] as const;

export const scheduledPostStatuses = [
  "SCHEDULED",
  "READY_TO_SEND",
  "PUBLISHED",
  "FAILED",
  "CANCELED"
] as const;

export type MarketplaceType = (typeof marketplaceTypes)[number];
export type IntegrationType = (typeof integrationTypes)[number];
export type CampaignStatus = (typeof campaignStatuses)[number];
export type Channel = (typeof channels)[number];
export type OfferStatus = (typeof offerStatuses)[number];
export type ScheduledPostStatus = (typeof scheduledPostStatuses)[number];

export const urlSchema = z.string().trim().url();

export const searchOffersSchema = z.object({
  marketplaceKey: z.string().trim().optional(),
  keyword: z.string().trim().min(1).optional(),
  category: z.string().trim().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minDiscount: z.coerce.number().min(0).max(100).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  freeShipping: z.coerce.boolean().optional(),
  hasCoupon: z.coerce.boolean().optional(),
  minCommission: z.coerce.number().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(["discount", "rating", "price", "commission", "score"])
    .default("score")
});

export const opportunityRadarSchema = z
  .object({
    marketplaceKey: z.string().trim().optional(),
    keyword: z.string().trim().optional(),
    categories: z.array(z.string().trim().min(2)).max(12).default([]),
    limitPerCategory: z.coerce.number().int().min(1).max(50).default(10),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    minDiscount: z.coerce.number().min(0).max(100).optional(),
    sortBy: z
      .enum(["discount", "rating", "price", "commission", "score"])
      .default("score")
  })
  .superRefine((data, ctx) => {
    if (!data.keyword?.trim() && !data.categories.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe uma pesquisa livre ou selecione pelo menos uma categoria.",
        path: ["keyword"]
      });
    }
  });

export const generateAffiliateLinkSchema = z.object({
  marketplaceKey: z.string().trim(),
  destinationUrl: urlSchema,
  campaignId: z.string().trim().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const manualUrlSchema = z.object({
  url: urlSchema,
  affiliateUrl: z.string().trim().url().optional().or(z.literal("")),
  couponCode: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

export const messageRenderSchema = z.object({
  templateId: z.string().uuid().optional(),
  templateContent: z.string().optional(),
  channel: z.enum(channels).default("WHATSAPP")
});

export type SearchOffersParams = z.infer<typeof searchOffersSchema>;
export type OpportunityRadarParams = z.infer<typeof opportunityRadarSchema>;
export type GenerateAffiliateLinkParams = z.infer<typeof generateAffiliateLinkSchema>;

export interface OfferCandidate {
  marketplaceKey: string;
  externalId?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  productUrl: string;
  affiliateUrl?: string;
  currentPrice?: number;
  oldPrice?: number;
  discountPercent?: number;
  couponCode?: string;
  couponDescription?: string;
  rating?: number;
  reviewCount?: number;
  freeShipping?: boolean;
  estimatedCommission?: number;
  commissionPercent?: number;
  category?: string;
  brand?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface ProductExtractionResult {
  marketplaceKey: string;
  title: string;
  description?: string;
  imageUrl?: string;
  productUrl: string;
  externalId?: string;
  currentPrice?: number;
  oldPrice?: number;
  discountPercent?: number;
  rating?: number;
  reviewCount?: number;
  freeShipping?: boolean;
  brand?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface AffiliateLinkResult {
  affiliateUrl?: string;
  requiresManualInput: boolean;
  provider?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface CouponValidationResult {
  valid: boolean;
  message?: string;
  discountPercent?: number;
  metadata?: Record<string, unknown>;
}

export interface ConnectorHealthResult {
  ok: boolean;
  mode: "API" | "FEED" | "MANUAL" | "ASSISTED";
  message?: string;
}

export interface MarketplaceConnector {
  marketplaceKey: string;
  searchOffers(params: SearchOffersParams): Promise<OfferCandidate[]>;
  extractFromUrl(url: string): Promise<ProductExtractionResult>;
  generateAffiliateLink(params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult>;
  validateCoupon?(params: { couponCode: string; url?: string }): Promise<CouponValidationResult>;
  healthCheck(): Promise<ConnectorHealthResult>;
}

export function detectMarketplaceKey(rawUrl: string): MarketplaceType {
  const host = new URL(rawUrl).hostname.toLowerCase();
  if (host.includes("natura") || host.includes("awin")) return "AWIN";
  if (host.includes("shopee")) return "SHOPEE";
  if (host.includes("mercadolivre") || host.includes("mercadolibre")) return "MERCADO_LIVRE";
  if (host.includes("magazineluiza") || host.includes("magalu")) return "MAGALU";
  return "MANUAL";
}

export function calculateOfferScore(candidate: Partial<OfferCandidate>): number {
  const discountScore = Math.min(Math.max(candidate.discountPercent ?? 0, 0), 80) / 80 * 100;
  const ratingScore = Math.min(Math.max(candidate.rating ?? 0, 0), 5) / 5 * 100;
  const popularityScore = Math.min(Math.log10((candidate.reviewCount ?? 0) + 1) / 5, 1) * 100;
  const couponScore = candidate.couponCode ? 100 : 0;
  const shippingScore = candidate.freeShipping ? 100 : 0;
  const commissionScore = Math.min(Math.max(candidate.commissionPercent ?? 0, 0), 20) / 20 * 100;
  const priceHistoryScore = candidate.oldPrice && candidate.currentPrice ? discountScore : 30;
  const categoryScore = candidate.category ? 65 : 35;

  const score =
    discountScore * 0.25 +
    ratingScore * 0.15 +
    popularityScore * 0.1 +
    couponScore * 0.15 +
    shippingScore * 0.1 +
    commissionScore * 0.1 +
    priceHistoryScore * 0.1 +
    categoryScore * 0.05;

  return Math.round(score * 100) / 100;
}

export function maskSecret(value?: string | null): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
