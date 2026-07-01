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

export class MercadoLivreConnector implements MarketplaceConnector {
  marketplaceKey = "MERCADO_LIVRE";

  constructor(private readonly env: ConnectorEnv) {}

  async searchOffers(_params: SearchOffersParams): Promise<OfferCandidate[]> {
    return [];
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    const result = await extractPublicMetadata(url);
    return { ...result, marketplaceKey: "MERCADO_LIVRE" };
  }

  async generateAffiliateLink(params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    if (this.env.MELI_AFFILIATE_TAG) {
      const url = new URL(params.destinationUrl);
      url.searchParams.set("matt_tool", this.env.MELI_AFFILIATE_TAG);
      return {
        affiliateUrl: url.toString(),
        requiresManualInput: false,
        provider: "mercado-livre",
        metadata: { rule: "query-param-tag" }
      };
    }

    return {
      requiresManualInput: true,
      provider: "mercado-livre",
      message: "Mercado Livre esta no modo assistido. Cole o link gerado no Portal do Afiliado."
    };
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return {
      ok: true,
      mode: this.env.MELI_AFFILIATE_TAG ? "ASSISTED" : "MANUAL",
      message: this.env.MELI_AFFILIATE_TAG
        ? "Regra de tag configurada. Valide o padrao oficial da conta antes de publicar."
        : "Modo assistido recomendado para Mercado Livre."
    };
  }
}
