import {
  calculateOfferScore,
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

export class AwinConnector implements MarketplaceConnector {
  marketplaceKey = "AWIN";

  constructor(private readonly env: ConnectorEnv) {}

  async searchOffers(params: SearchOffersParams): Promise<OfferCandidate[]> {
    if (!this.env.AWIN_API_TOKEN || !this.env.AWIN_PUBLISHER_ID) return [];

    const advertiserId = this.env.AWIN_NATURA_ADVERTISER_ID;
    const query = new URLSearchParams();
    if (params.keyword) query.set("q", params.keyword);
    if (advertiserId) query.set("advertiserId", advertiserId);

    // Product Feed availability varies by account. This lightweight MVP keeps the
    // adapter isolated so a real feed endpoint can be swapped in without touching routes.
    return [];
  }

  async extractFromUrl(url: string): Promise<ProductExtractionResult> {
    const result = await extractPublicMetadata(url);
    return { ...result, marketplaceKey: "AWIN" };
  }

  async generateAffiliateLink(params: GenerateAffiliateLinkParams): Promise<AffiliateLinkResult> {
    if (!this.env.AWIN_API_TOKEN || !this.env.AWIN_PUBLISHER_ID) {
      return {
        requiresManualInput: true,
        provider: "awin",
        message: "Configure AWIN_API_TOKEN e AWIN_PUBLISHER_ID para gerar links automaticamente."
      };
    }

    const url = new URL(`https://www.awin1.com/cread.php`);
    url.searchParams.set("awinmid", this.env.AWIN_NATURA_ADVERTISER_ID ?? "");
    url.searchParams.set("awinaffid", this.env.AWIN_PUBLISHER_ID);
    url.searchParams.set("ued", params.destinationUrl);
    if (params.campaignId) url.searchParams.set("clickref", params.campaignId);

    return {
      affiliateUrl: url.toString(),
      requiresManualInput: false,
      provider: "awin",
      metadata: {
        advertiserId: this.env.AWIN_NATURA_ADVERTISER_ID,
        publisherId: this.env.AWIN_PUBLISHER_ID,
        score: calculateOfferScore({})
      }
    };
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    const configured = Boolean(this.env.AWIN_API_TOKEN && this.env.AWIN_PUBLISHER_ID);
    return {
      ok: configured,
      mode: configured ? "API" : "ASSISTED",
      message: configured ? "Awin configurado." : "Awin sem token/publisher; usar fluxo assistido."
    };
  }
}
