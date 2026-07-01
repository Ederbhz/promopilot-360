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

export class MagaluConnector implements MarketplaceConnector {
  marketplaceKey = "MAGALU";

  constructor(private readonly env: ConnectorEnv) {}

  async searchOffers(_params: SearchOffersParams): Promise<OfferCandidate[]> {
    return [];
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    const result = await extractPublicMetadata(url);
    return { ...result, marketplaceKey: "MAGALU" };
  }

  async generateAffiliateLink(_params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    return {
      requiresManualInput: true,
      provider: "magalu",
      message: this.env.MAGALU_STORE_URL
        ? "Loja Magalu configurada. Cole o link final de divulgador para manter rastreabilidade."
        : "Configure MAGALU_STORE_URL ou informe o link afiliado final manualmente."
    };
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return {
      ok: Boolean(this.env.MAGALU_STORE_URL),
      mode: "ASSISTED",
      message: this.env.MAGALU_STORE_URL
        ? "Magalu em modo assistido com loja configurada."
        : "Magalu em modo assistido sem loja configurada."
    };
  }
}
