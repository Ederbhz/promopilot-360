import { env } from "../config/env.js";

export type InstagramSurface = "FEED" | "STORY";

export interface InstagramPublishInput {
  surface: InstagramSurface;
  message: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  affiliateUrl?: string | null;
}

export async function testInstagramConnection() {
  assertInstagramConfig();
  return graphGet<{ id: string; username?: string; account_type?: string }>(
    `${env.INSTAGRAM_IG_USER_ID}?fields=id,username,account_type`
  );
}

export async function publishInstagramContent(input: InstagramPublishInput) {
  assertInstagramConfig();

  if (!input.imageUrl && !input.videoUrl) {
    throw new Error("Informe uma imagem ou video publico para publicar no Instagram.");
  }

  const creationId = await createMediaContainer(input);
  if (input.videoUrl) await waitForVideoContainer(creationId);
  const published = await graphPost<{ id: string }>(`${env.INSTAGRAM_IG_USER_ID}/media_publish`, {
    creation_id: creationId
  });

  return {
    id: published.id,
    creationId,
    surface: input.surface,
    affiliateUrl: input.affiliateUrl,
    warning:
      input.surface === "STORY"
        ? "A API oficial publica a midia do story; link clicavel em sticker nao e exposto pela API de publicacao."
        : undefined
  };
}

async function createMediaContainer(input: InstagramPublishInput) {
  const params: Record<string, string> = {};

  if (input.surface === "STORY") {
    params.media_type = "STORIES";
    if (input.videoUrl) {
      params.video_url = input.videoUrl;
    } else if (input.imageUrl) {
      params.image_url = input.imageUrl;
    }
  } else {
    if (input.videoUrl) {
      params.media_type = "REELS";
      params.video_url = input.videoUrl;
      params.caption = buildFeedCaption(input.message, input.affiliateUrl);
    } else if (input.imageUrl) {
      params.image_url = input.imageUrl;
      params.caption = buildFeedCaption(input.message, input.affiliateUrl);
    }
  }

  const created = await graphPost<{ id: string }>(`${env.INSTAGRAM_IG_USER_ID}/media`, params);
  return created.id;
}

async function waitForVideoContainer(creationId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const status = await graphGet<{ status?: string; status_code?: string }>(`${creationId}?fields=status,status_code`);
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram recusou o processamento da midia. Status: ${status.status_code}.`);
    }
    await sleep(3000);
  }
  throw new Error("Instagram ainda esta processando a midia. Tente publicar novamente em alguns instantes.");
}

function buildFeedCaption(message: string, affiliateUrl?: string | null) {
  const trimmed = message.trim();
  if (!affiliateUrl || trimmed.includes(affiliateUrl)) return trimmed;
  return `${trimmed}\n\n${affiliateUrl}`;
}

async function graphGet<T>(path: string) {
  const url = graphUrl(path);
  url.searchParams.set("access_token", env.INSTAGRAM_ACCESS_TOKEN!);
  const response = await fetch(url);
  return readGraphResponse<T>(response);
}

async function graphPost<T>(path: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: env.INSTAGRAM_ACCESS_TOKEN! });
  const response = await fetch(graphUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  return readGraphResponse<T>(response);
}

function graphUrl(path: string) {
  return new URL(`${graphBaseUrl()}/${path.replace(/^\//, "")}`);
}

function graphBaseUrl() {
  return `https://graph.facebook.com/${env.INSTAGRAM_GRAPH_VERSION}`;
}

async function readGraphResponse<T>(response: Response) {
  const text = await response.text();
  const payload = safeJson(text) as T & { error?: { message?: string; code?: number; error_subcode?: number } };
  if (!response.ok || payload.error) {
    const detail = payload.error?.message || text.replace(/\s+/g, " ").slice(0, 240);
    const code = payload.error?.code ? ` Codigo: ${payload.error.code}.` : "";
    const subcode = payload.error?.error_subcode ? ` Subcodigo: ${payload.error.error_subcode}.` : "";
    throw new Error(`Instagram Graph API recusou a publicacao (${response.status}).${code}${subcode} Detalhe: ${detail}`);
  }
  return payload;
}

function safeJson(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertInstagramConfig() {
  if (!env.INSTAGRAM_IG_USER_ID || !env.INSTAGRAM_ACCESS_TOKEN) {
    throw new Error("Configure INSTAGRAM_IG_USER_ID e INSTAGRAM_ACCESS_TOKEN para publicar no Instagram.");
  }
}
