import { detectMarketplaceKey, type MarketplaceConnector, type MarketplaceType } from "@promopilot/shared";
import { AwinConnector } from "./connectors/awin.js";
import { ShopeeConnector } from "./connectors/shopee.js";
import { MercadoLivreConnector } from "./connectors/mercado-livre.js";
import { MagaluConnector } from "./connectors/magalu.js";
import { ManualConnector } from "./connectors/manual.js";

export interface ConnectorEnv {
  AWIN_API_TOKEN?: string;
  AWIN_PUBLISHER_ID?: string;
  AWIN_NATURA_ADVERTISER_ID?: string;
  SHOPEE_APP_ID?: string;
  SHOPEE_APP_SECRET?: string;
  SHOPEE_AFFILIATE_ID?: string;
  SHOPEE_API_BASE_URL?: string;
  MELI_AFFILIATE_TAG?: string;
  MAGALU_STORE_URL?: string;
}

export function createConnectorRegistry(env: ConnectorEnv = {}): Record<MarketplaceType, MarketplaceConnector> {
  return {
    AWIN: new AwinConnector(env),
    SHOPEE: new ShopeeConnector(env),
    MERCADO_LIVRE: new MercadoLivreConnector(env),
    MAGALU: new MagaluConnector(env),
    MANUAL: new ManualConnector()
  };
}

export function getConnectorForUrl(
  rawUrl: string,
  registry: Record<MarketplaceType, MarketplaceConnector>
): MarketplaceConnector {
  return registry[detectMarketplaceKey(rawUrl)] ?? registry.MANUAL;
}
