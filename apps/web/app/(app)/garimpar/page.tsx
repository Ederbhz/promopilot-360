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
  const [sortBy, setSortBy] = useState("score");
  const [minDiscount, setMinDiscount] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [limit, setLimit] = useState("20");
  const [productUrl, setProductUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [importingUrl, setImportingUrl] = useState(false);
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
      const result = await postJson<{
        offers: Offer[];
        count: number;
        warnings?: Array<{ marketplaceKey: string; message: string }>;
      }>("/offers/search", {
        marketplaceKey: marketplaceKey || undefined,
        keyword: keyword || undefined,
        minDiscount: numberOrUndefined(minDiscount),
        minPrice: numberOrUndefined(minPrice),
        maxPrice: numberOrUndefined(maxPrice),
        limit: Number(limit) || 20,
        sortBy
      });
      setOffers(result.offers);
      const warnings = result.warnings ?? [];
      setMessage(
        [
          result.count
            ? `${result.count} ofertas importadas.`
            : "Nenhuma oferta importada automaticamente. Use o importador por link quando o marketplace bloquear busca publica.",
          ...warnings.map((warning) => `${warning.marketplaceKey}: ${warning.message}`)
        ].join(" ")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao buscar ofertas.");
    } finally {
      setLoading(false);
    }
  }

  async function importProductUrl(event: FormEvent) {
    event.preventDefault();
    setImportingUrl(true);
    setError("");
    setMessage("");
    try {
      const offer = await postJson<Offer>("/offers/manual-url", {
        url: productUrl,
        affiliateUrl: affiliateUrl || undefined,
        couponCode: couponCode || undefined
      });
      setOffers((current) => [offer, ...current]);
      setProductUrl("");
      setAffiliateUrl("");
      setCouponCode("");
      setMessage("Produto importado para divulgacao.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar link.");
    } finally {
      setImportingUrl(false);
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
      <Panel className="mb-4">
        <form onSubmit={importProductUrl} className="grid gap-3 lg:grid-cols-[1.4fr_1.2fr_0.7fr_auto]">
          <label>
            <span className="mb-1 block text-sm font-medium">Link do produto</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              placeholder="https://..."
              type="url"
              required
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Link afiliado final</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={affiliateUrl}
              onChange={(event) => setAffiliateUrl(event.target.value)}
              placeholder="Opcional"
              type="url"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Cupom</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              placeholder="Opcional"
            />
          </label>
          <button
            className="focus-ring mt-auto flex items-center justify-center gap-2 rounded-md bg-amber px-4 py-2 font-semibold text-ink hover:bg-amber/90 disabled:opacity-70"
            disabled={importingUrl}
          >
            <Link2 size={17} aria-hidden />
            {importingUrl ? "Importando..." : "Importar"}
          </button>
        </form>
      </Panel>
      <Panel>
        <form onSubmit={submit} className="grid gap-3 lg:grid-cols-4">
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
              placeholder="ofertas, tenis, perfume"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Prioridade</span>
            <select
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="score">Melhor score</option>
              <option value="discount">Maior desconto</option>
              <option value="price">Menor preco</option>
              <option value="rating">Melhor avaliacao</option>
              <option value="commission">Maior comissao</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Limite</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              inputMode="numeric"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Desconto minimo</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              inputMode="decimal"
              value={minDiscount}
              onChange={(event) => setMinDiscount(event.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Preco minimo</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              inputMode="decimal"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="50"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Preco maximo</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              inputMode="decimal"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="100000"
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

function numberOrUndefined(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
