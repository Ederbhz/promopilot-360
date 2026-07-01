import { createConnectorRegistry } from "@promopilot/marketplace-connectors";
import { env } from "../config/env.js";

export const connectors = createConnectorRegistry({
  AWIN_API_TOKEN: env.AWIN_API_TOKEN,
  AWIN_PUBLISHER_ID: env.AWIN_PUBLISHER_ID,
  AWIN_NATURA_ADVERTISER_ID: env.AWIN_NATURA_ADVERTISER_ID,
  SHOPEE_APP_ID: env.SHOPEE_APP_ID,
  SHOPEE_APP_SECRET: env.SHOPEE_APP_SECRET,
  SHOPEE_AFFILIATE_ID: env.SHOPEE_AFFILIATE_ID,
  SHOPEE_API_BASE_URL: env.SHOPEE_API_BASE_URL,
  MELI_AFFILIATE_TAG: env.MELI_AFFILIATE_TAG,
  MAGALU_STORE_URL: env.MAGALU_STORE_URL
});
