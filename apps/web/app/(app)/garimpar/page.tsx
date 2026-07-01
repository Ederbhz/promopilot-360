"use client";

import { FormEvent, useEffect, useState } from "react";
import { Link2, MessageSquareText, Search } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson } from "@/lib/api";

interface Marketplace {
  id: string;
  key: string;
  name: string;
}

interface Offer {
  id: string;
  status: string;
  score: string | number | null;
  currentPrice?: string | number | null;
  affiliateUrl?: string | null;
  product: { title: string; imageUrl?: string | null };
  marketplace: { name: string; key: string };
}

export default function GarimparPage() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [marketplaceKey, setMarketplaceKey] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiFetch<Marketplace[]>("/marketplaces").then(setMarketplaces).catch(() => setMarketplaces([]));
    apiFetch<Offer[]>("/offers").then(setOffers).catch(() => setOffers([]));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await postJson<{ offers: Offer[]; count: number }>("/offers/search", {
        marketplaceKey: marketplaceKey || undefined,
        keyword: keyword || undefined,
        limit: 20,
        sortBy: "score"
      });
      setOffers(result.offers);
      setMessage(`${result.count} ofertas importadas.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao buscar ofertas.");
    } finally {
      setLoading(false);
    }
  }

  async function generateAffiliateLink(offerId: string) {
    const result = await postJson<{ offer: Offer; result: { message?: string } }>(`/offers/${offerId}/generate-affiliate-link`, {});
    setOffers((current) => current.map((offer) => (offer.id === offerId ? result.offer : offer)));
    setMessage(result.result.message || "Link afiliado atualizado.");
  }

  async function generateMessage(offerId: string) {
    const result = await postJson<{ message: string }>(`/offers/${offerId}/generate-message`, { channel: "WHATSAPP" });
    await navigator.clipboard?.writeText(result.message);
    setMessage("Mensagem gerada e copiada.");
  }

  return (
    <>
      <PageHeader title="Garimpar ofertas" eyebrow="Busca" />
      <Panel>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label>
            <span className="mb-1 block text-sm font-medium">Marketplace</span>
            <select
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={marketplaceKey}
              onChange={(event) => setMarketplaceKey(event.target.value)}
            >
              <option value="">Todos ativos</option>
              {marketplaces.map((marketplace) => (
                <option value={marketplace.key} key={marketplace.id}>
                  {marketplace.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Palavra-chave</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="tenis, perfume, suplemento"
            />
          </label>
          <button
            className="focus-ring mt-auto flex items-center justify-center gap-2 rounded-md bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-70"
            disabled={loading}
          >
            <Search size={17} aria-hidden />
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      </Panel>

      {error ? <div className="mt-4"><ErrorLine message={error} /></div> : null}
      {message ? <p className="mt-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}

      <div className="mt-5 grid gap-3">
        {offers.map((offer) => (
          <Panel key={offer.id} className="p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-mist">
                  {offer.product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={offer.product.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <h2 className="line-clamp-2 text-sm font-semibold text-ink">{offer.product.title}</h2>
                  <p className="text-sm text-[var(--muted)]">{offer.marketplace.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 items-center gap-3 md:w-[360px]">
                <div>
                  <p className="text-xs text-[var(--muted)]">Score</p>
                  <p className="font-semibold">{Number(offer.score ?? 0).toFixed(0)}</p>
                </div>
                <StatusBadge value={offer.status} />
                <div className="flex justify-end gap-2">
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => generateAffiliateLink(offer.id)}
                    type="button"
                    title="Gerar link afiliado"
                  >
                    <Link2 size={17} aria-hidden />
                  </button>
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => generateMessage(offer.id)}
                    type="button"
                    title="Gerar mensagem"
                  >
                    <MessageSquareText size={17} aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
