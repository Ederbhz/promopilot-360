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

export class ManualConnector implements MarketplaceConnector {
  marketplaceKey = "MANUAL";

  async searchOffers(_params: SearchOffersParams): Promise<OfferCandidate[]> {
    return [];
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    return extractPublicMetadata(url);
  }

  async generateAffiliateLink(_params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    return {
      requiresManualInput: true,
      provider: "manual",
      message: "Informe o link afiliado final para este marketplace."
    };
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return {
      ok: true,
      mode: "MANUAL",
      message: "Modo manual ativo."
    };
  }
}
