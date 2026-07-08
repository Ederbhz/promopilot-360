import { env } from "../config/env.js";

export interface FacebookPublishInput {
  message: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
}

export async function testFacebookConnection() {
  assertFacebookConfig();
  return graphGet<{ id: string; name?: string; category?: string }>(
    `${env.FACEBOOK_PAGE_ID}?fields=id,name,category`
  );
}

export async function publishFacebookPageContent(input: FacebookPublishInput) {
  assertFacebookConfig();
  const message = buildMessage(input.message, input.linkUrl);

  if (input.imageUrl) {
    const response = await graphPost<{ id: string; post_id?: string }>(`${env.FACEBOOK_PAGE_ID}/photos`, {
      url: input.imageUrl,
      caption: message,
      published: "true"
    });
    return {
      id: response.post_id ?? response.id,
      photoId: response.id,
      mode: "photo",
      linkUrl: input.linkUrl
    };
  }

  const response = await graphPost<{ id: string }>(`${env.FACEBOOK_PAGE_ID}/feed`, {
    message,
    ...(input.linkUrl ? { link: input.linkUrl } : {})
  });
  return {
    id: response.id,
    mode: "feed",
    linkUrl: input.linkUrl
  };
}

function buildMessage(message: string, linkUrl?: string | null) {
  const trimmed = message.trim();
  if (!linkUrl || trimmed.includes(linkUrl)) return trimmed;
  return `${trimmed}\n\n${linkUrl}`;
}

async function graphGet<T>(path: string) {
  const url = graphUrl(path);
  url.searchParams.set("access_token", env.FACEBOOK_PAGE_ACCESS_TOKEN!);
  const response = await fetch(url);
  return readGraphResponse<T>(response);
}

async function graphPost<T>(path: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: env.FACEBOOK_PAGE_ACCESS_TOKEN! });
  const response = await fetch(graphUrl(path), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  return readGraphResponse<T>(response);
}

function graphUrl(path: string) {
  return new URL(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
}

async function readGraphResponse<T>(response: Response) {
  const text = await response.text();
  const payload = safeJson(text) as T & { error?: { message?: string; code?: number; error_subcode?: number } };
  if (!response.ok || payload.error) {
    const detail = payload.error?.message || text.replace(/\s+/g, " ").slice(0, 240);
    const code = payload.error?.code ? ` Codigo: ${payload.error.code}.` : "";
    const subcode = payload.error?.error_subcode ? ` Subcodigo: ${payload.error.error_subcode}.` : "";
    throw new Error(`Facebook Graph API recusou a publicacao (${response.status}).${code}${subcode} Detalhe: ${detail}`);
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

function assertFacebookConfig() {
  if (!env.FACEBOOK_PAGE_ID || !env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    throw new Error("Configure FACEBOOK_PAGE_ID e FACEBOOK_PAGE_ACCESS_TOKEN para publicar no Facebook.");
  }
}
