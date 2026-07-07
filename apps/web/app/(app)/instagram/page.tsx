"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, Image as ImageIcon, Instagram, RefreshCw, Send } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson } from "@/lib/api";

type InstagramSurface = "FEED" | "STORY";

interface Offer {
  id: string;
  status: string;
  affiliateUrl?: string | null;
  currentPrice?: string | number | null;
  discountPercent?: string | number | null;
  product: { title: string; imageUrl?: string | null; productUrl: string };
  marketplace: { name: string };
}

interface InstagramProfile {
  id: string;
  username?: string;
  account_type?: string;
}

interface InstagramPublishResult {
  id: string;
  creationId: string;
  surface: InstagramSurface;
  affiliateUrl?: string | null;
  warning?: string;
}

export default function InstagramPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerId, setOfferId] = useState("");
  const [surface, setSurface] = useState<InstagramSurface>("FEED");
  const [messageText, setMessageText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [profile, setProfile] = useState<InstagramProfile | null>(null);
  const [publishResult, setPublishResult] = useState<InstagramPublishResult | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedOffer = useMemo(() => offers.find((offer) => offer.id === offerId) ?? null, [offers, offerId]);

  async function load() {
    const offerData = await apiFetch<Offer[]>("/offers?scope=generated");
    setOffers(offerData);
    setOfferId((current) => current || offerData[0]?.id || "");
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar ofertas."));
  }, []);

  useEffect(() => {
    if (!selectedOffer) {
      setMessageText("");
      setImageUrl("");
      return;
    }
    setImageUrl(selectedOffer.product.imageUrl ?? "");
    let canceled = false;
    postJson<{ message: string }>(`/offers/${selectedOffer.id}/generate-message`, { channel: "INSTAGRAM" })
      .then((result) => {
        if (!canceled) setMessageText(result.message);
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [selectedOffer]);

  async function testConnection() {
    setError("");
    setNotice("");
    setBusyAction("test");
    try {
      const result = await postJson<InstagramProfile>("/channels/instagram/test", {});
      setProfile(result);
      setNotice(result.username ? `Instagram conectado: @${result.username}.` : "Instagram conectado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar Instagram.");
    } finally {
      setBusyAction("");
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!selectedOffer) return;
    setError("");
    setNotice("");
    setPublishResult(null);
    setBusyAction("publish");
    try {
      const result = await postJson<InstagramPublishResult>("/channels/instagram/publish", {
        offerId: selectedOffer.id,
        surface,
        message: messageText || undefined,
        imageUrl: imageUrl || undefined,
        videoUrl: videoUrl || undefined
      });
      setPublishResult(result);
      setNotice(surface === "FEED" ? "Publicado no feed." : "Story enviado para publicacao.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar no Instagram.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <>
      <PageHeader
        title="Instagram"
        eyebrow="Publicacao"
        actions={
          <>
            <button
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist disabled:opacity-60"
              disabled={Boolean(busyAction)}
              onClick={testConnection}
              type="button"
            >
              <Instagram size={16} aria-hidden />
              {busyAction === "test" ? "Testando..." : "Testar"}
            </button>
            <button
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist disabled:opacity-60"
              disabled={Boolean(busyAction)}
              onClick={() => load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao atualizar."))}
              type="button"
            >
              <RefreshCw size={16} aria-hidden />
              Atualizar
            </button>
          </>
        }
      />

      {error ? <div className="mb-4"><ErrorLine message={error} /></div> : null}
      {notice ? <p className="mb-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{notice}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <form onSubmit={publish} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Oferta</span>
              <select
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={offerId}
                onChange={(event) => setOfferId(event.target.value)}
                required
              >
                <option value="">Selecione</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.product.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <span className="block text-sm font-medium">Destino</span>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-[var(--border)] bg-mist p-1">
                <button
                  className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${
                    surface === "FEED" ? "bg-white text-leaf shadow-soft" : "text-[var(--muted)] hover:bg-white"
                  }`}
                  onClick={() => setSurface("FEED")}
                  type="button"
                >
                  Feed
                </button>
                <button
                  className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${
                    surface === "STORY" ? "bg-white text-leaf shadow-soft" : "text-[var(--muted)] hover:bg-white"
                  }`}
                  onClick={() => setSurface("STORY")}
                  type="button"
                >
                  Stories
                </button>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Legenda</span>
              <textarea
                className="focus-ring min-h-44 w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Imagem publica</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                type="url"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Video publico</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                type="url"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="Opcional"
              />
            </label>

            {surface === "STORY" ? (
              <p className="rounded-md bg-saffron/10 px-3 py-2 text-sm text-ink">
                Stories publicam a midia pela API oficial; o link fica disponivel para uso manual.
              </p>
            ) : null}

            <button
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-60"
              disabled={!selectedOffer || busyAction === "publish"}
            >
              <Send size={17} aria-hidden />
              {busyAction === "publish" ? "Publicando..." : "Publicar no Instagram"}
            </button>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel>
            {selectedOffer ? (
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-md bg-mist">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon size={26} className="text-[var(--muted)]" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusBadge value={selectedOffer.status} />
                      <span className="text-sm text-[var(--muted)]">{selectedOffer.marketplace.name}</span>
                    </div>
                    <h2 className="line-clamp-2 font-semibold text-ink">{selectedOffer.product.title}</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {formatPrice(selectedOffer.currentPrice) || "Preco nao informado"}
                    </p>
                  </div>
                </div>

                {selectedOffer.affiliateUrl ? (
                  <div className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">{selectedOffer.affiliateUrl}</p>
                    <button
                      className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                      onClick={() => navigator.clipboard?.writeText(selectedOffer.affiliateUrl || "")}
                      title="Copiar link"
                      type="button"
                    >
                      <Clipboard size={16} aria-hidden />
                    </button>
                    <button
                      className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                      onClick={() => window.open(selectedOffer.affiliateUrl || selectedOffer.product.productUrl, "_blank")}
                      title="Abrir link"
                      type="button"
                    >
                      <ExternalLink size={16} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <p className="rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">
                    Gere o link afiliado antes de publicar.
                  </p>
                )}

                <div className="rounded-md border border-[var(--border)] bg-white">
                  <div className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold text-ink">
                    Preview {surface === "FEED" ? "Feed" : "Stories"}
                  </div>
                  <div className={surface === "FEED" ? "grid gap-3 p-3 sm:grid-cols-[180px_1fr]" : "mx-auto max-w-[260px] p-3"}>
                    <div className={surface === "FEED" ? "aspect-square overflow-hidden rounded-md bg-mist" : "aspect-[9/16] overflow-hidden rounded-md bg-mist"}>
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    {surface === "FEED" ? (
                      <p className="max-h-72 overflow-auto whitespace-pre-wrap text-sm text-ink">{messageText}</p>
                    ) : null}
                  </div>
                </div>

                {profile ? (
                  <p className="text-xs text-[var(--muted)]">
                    Conta: {profile.username ? `@${profile.username}` : profile.id}
                    {profile.account_type ? ` - ${profile.account_type}` : ""}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-[250px] place-items-center rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
                Selecione uma oferta
              </div>
            )}
          </Panel>

          {publishResult ? (
            <Panel>
              <h2 className="mb-3 font-semibold text-ink">Resultado</h2>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Post:</span> {publishResult.id}
                </p>
                <p>
                  <span className="font-medium">Container:</span> {publishResult.creationId}
                </p>
                {publishResult.warning ? <p className="text-[var(--muted)]">{publishResult.warning}</p> : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}

function formatPrice(value?: string | number | null) {
  if (value === null || value === undefined) return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed);
}
