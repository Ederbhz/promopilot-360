import {
  type AffiliateLinkResult,
  type ConnectorHealthResult,
  type GenerateAffiliateLinkParams,
  type MarketplaceConnector,
  type OfferCandidate,
  type ProductExtractionResult,
  type SearchOffersParams
} from "@promopilot/shared";
import { extractPublicMetadata } from "../extract.js";
import type { ConnectorEnv } from "../registry.js";

export class ShopeeConnector implements MarketplaceConnector {
  marketplaceKey = "SHOPEE";

  constructor(private readonly env: ConnectorEnv) {}

  async searchOffers(_params: SearchOffersParams): Promise<OfferCandidate[]> {
    return [];
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    const result = await extractPublicMetadata(url);
    return { ...result, marketplaceKey: "SHOPEE" };
  }

  async generateAffiliateLink(params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    if (!this.env.SHOPEE_APP_ID || !this.env.SHOPEE_APP_SECRET || !this.env.SHOPEE_AFFILIATE_ID) {
      return {
        requiresManualInput: true,
        provider: "shopee",
        message: "Configure as credenciais oficiais da Shopee Affiliate Open API ou informe o link final manualmente."
      };
    }

    return {
      requiresManualInput: true,
      provider: "shopee",
      message: "Credenciais encontradas. A chamada assinada da API Shopee deve ser habilitada conforme liberacao da conta.",
      metadata: { destinationUrl: params.destinationUrl }
    };
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    const configured = Boolean(this.env.SHOPEE_APP_ID && this.env.SHOPEE_APP_SECRET);
    return {
      ok: configured,
      mode: configured ? "API" : "ASSISTED",
      message: configured ? "Shopee configurada." : "Shopee em modo manual/assistido."
    };
  }
}
