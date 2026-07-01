"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarPlus, Clipboard, Link2, MessageSquareText, ScanSearch } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson } from "@/lib/api";

interface Campaign {
  id: string;
  name: string;
  channel: string;
}

interface Offer {
  id: string;
  status: string;
  affiliateUrl?: string | null;
  currentPrice?: string | number | null;
  product: { title: string; imageUrl?: string | null; productUrl: string };
  marketplace: { name: string };
}

export default function LinksManuaisPage() {
  const [url, setUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<Campaign[]>("/campaigns").then(setCampaigns).catch(() => setCampaigns([]));
  }, []);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const created = await postJson<Offer>("/offers/manual-url", {
        url,
        affiliateUrl: affiliateUrl || undefined,
        couponCode: couponCode || undefined
      });
      setOffer(created);
      setMessage("Oferta cadastrada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao analisar link.");
    } finally {
      setLoading(false);
    }
  }

  async function generateMessage() {
    if (!offer) return;
    const result = await postJson<{ message: string }>(`/offers/${offer.id}/generate-message`, { channel: "WHATSAPP" });
    await navigator.clipboard?.writeText(result.message);
    setMessage("Mensagem copiada.");
  }

  async function addToQueue() {
    if (!offer || !campaignId) return;
    const campaign = campaigns.find((item) => item.id === campaignId);
    await postJson("/scheduled-posts", {
      campaignId,
      offerId: offer.id,
      channel: campaign?.channel ?? "WHATSAPP",
      message: (await postJson<{ message: string }>(`/offers/${offer.id}/generate-message`, { channel: campaign?.channel ?? "WHATSAPP" })).message,
      scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      status: "READY_TO_SEND"
    });
    setMessage("Oferta adicionada a fila.");
  }

  return (
    <>
      <PageHeader title="Links manuais" eyebrow="Entrada rapida" />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <form onSubmit={analyze} className="space-y-3">
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Link2 size={15} aria-hidden />
                URL do produto
              </span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Link afiliado final</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={affiliateUrl}
                onChange={(event) => setAffiliateUrl(event.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Cupom</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value)}
              />
            </label>
            <button
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-70"
              disabled={loading}
            >
              <ScanSearch size={17} aria-hidden />
              {loading ? "Analisando..." : "Analisar"}
            </button>
          </form>
          {error ? <div className="mt-4"><ErrorLine message={error} /></div> : null}
          {message ? <p className="mt-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
        </Panel>

        <Panel>
          {offer ? (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-mist">
                  {offer.product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={offer.product.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={offer.status} />
                    <span className="text-sm text-[var(--muted)]">{offer.marketplace.name}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-ink">{offer.product.title}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {offer.affiliateUrl ? "Link afiliado cadastrado" : "Aguardando link afiliado"}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-mist"
                  onClick={generateMessage}
                  type="button"
                >
                  <MessageSquareText size={16} aria-hidden />
                  Mensagem
                </button>
                <button
                  className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-mist"
                  onClick={() => navigator.clipboard?.writeText(offer.affiliateUrl || offer.product.productUrl)}
                  type="button"
                >
                  <Clipboard size={16} aria-hidden />
                  Copiar link
                </button>
                <select
                  className="focus-ring rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                >
                  <option value="">Campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-saffron px-3 py-2 font-semibold text-white hover:bg-saffron/90 disabled:opacity-60"
                disabled={!campaignId}
                onClick={addToQueue}
                type="button"
              >
                <CalendarPlus size={17} aria-hidden />
                Adicionar a fila
              </button>
            </div>
          ) : (
            <div className="grid min-h-[250px] place-items-center rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
              Preview do produto
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
