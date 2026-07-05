"use client";

import { FormEvent, useEffect, useState } from "react";
import { Clipboard, ExternalLink, Link2, MessageSquareText, PlusCircle, Search } from "lucide-react";
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
  oldPrice?: string | number | null;
  discountPercent?: string | number | null;
  affiliateUrl?: string | null;
  product: { title: string; imageUrl?: string | null; category?: string | null };
  marketplace: { name: string; key: string };
}

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  marketplace?: { name: string } | null;
}

type OfferUpdate = Partial<Offer> & { id: string };

const categoryOptions = [
  "Fitness",
  "Alimentos",
  "Suplementos",
  "Beleza",
  "Moda",
  "Casa e jardim",
  "Eletronicos",
  "Infantil",
  "Pets"
];

export default function GarimparPage() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [generatedOffers, setGeneratedOffers] = useState<Offer[]>([]);
  const [marketplaceKey, setMarketplaceKey] = useState("");
  const [campaignByOffer, setCampaignByOffer] = useState<Record<string, string>>({});
  const [affiliateUrlByOffer, setAffiliateUrlByOffer] = useState<Record<string, string>>({});
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
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
    apiFetch<Campaign[]>("/campaigns").then(setCampaigns).catch(() => setCampaigns([]));
    apiFetch<Offer[]>("/offers?scope=garimpo").then(setOffers).catch(() => setOffers([]));
    apiFetch<Offer[]>("/offers?scope=generated").then(setGeneratedOffers).catch(() => setGeneratedOffers([]));
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
        skippedGenerated?: number;
      }>("/offers/search", {
        marketplaceKey: marketplaceKey || undefined,
        keyword: keyword || undefined,
        category: category || undefined,
        minDiscount: numberOrUndefined(minDiscount),
        minPrice: numberOrUndefined(minPrice),
        maxPrice: numberOrUndefined(maxPrice),
        limit: Number(limit) || 20,
        sortBy
      });
      setOffers(result.offers);
      const warnings = result.warnings ?? [];
      const skippedMessage = result.skippedGenerated
        ? `${result.skippedGenerated} ofertas ja tinham link gerado e foram ocultadas.`
        : "";
      setMessage(
        [
          result.count
            ? `${result.count} ofertas importadas.`
            : "Nenhuma oferta importada automaticamente. Use o importador por link quando o marketplace bloquear busca publica.",
          skippedMessage,
          ...warnings.map((warning) => `${warning.marketplaceKey}: ${warning.message}`)
        ].filter(Boolean).join(" ")
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
      if (offer.affiliateUrl) {
        setGeneratedOffers((current) => upsertOffer(current, offer));
      } else {
        setOffers((current) => upsertOffer(current, offer));
      }
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
    setError("");
    setMessage("");
    try {
      const result = await postJson<{ offer: OfferUpdate; result: { message?: string } }>(
        `/offers/${offerId}/generate-affiliate-link`,
        {}
      );
      const updated = result.offer;
      if (updated.affiliateUrl) {
        moveToGenerated(offerId, updated);
        const copied = await copyText(updated.affiliateUrl);
        setMessage(
          copied
            ? "Link afiliado gerado, copiado e movido para Links gerados."
            : "Link afiliado gerado e movido para Links gerados."
        );
      } else {
        setError(result.result.message || "Geracao automatica nao retornou link. Cole o link afiliado final no card da oferta.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar link afiliado.");
    }
  }

  async function saveAffiliateLink(offerId: string) {
    setError("");
    setMessage("");
    const affiliateUrl = affiliateUrlByOffer[offerId]?.trim();
    if (!affiliateUrl) {
      setError("Cole o link afiliado final antes de salvar.");
      return;
    }
    try {
      const result = await postJson<{ offer: OfferUpdate }>(`/offers/${offerId}/generate-affiliate-link`, {
        affiliateUrl
      });
      moveToGenerated(offerId, result.offer);
      setAffiliateUrlByOffer((current) => ({ ...current, [offerId]: "" }));
      setMessage("Link afiliado salvo e movido para Links gerados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar link afiliado.");
    }
  }

  async function copyAffiliateLink(offer: Offer) {
    if (!offer.affiliateUrl) {
      setError("Gere ou informe o link afiliado antes de copiar.");
      return;
    }
    const copied = await copyText(offer.affiliateUrl);
    setError("");
    setMessage(copied ? "Link afiliado copiado." : "Nao foi possivel copiar automaticamente. Abra o link e copie pela barra do navegador.");
  }

  async function addOfferToCampaign(offer: Offer) {
    setError("");
    setMessage("");
    const campaignId = campaignByOffer[offer.id];
    if (!campaignId) {
      setError("Selecione a campanha neste item antes de incluir a oferta.");
      return;
    }
    if (!offer.affiliateUrl) {
      setError("Gere ou cole o link afiliado final antes de incluir a oferta na campanha.");
      return;
    }
    try {
      const result = await postJson<{ offer: OfferUpdate }>(`/campaigns/${campaignId}/add-offer`, { offerId: offer.id });
      updateOfferInLists(result.offer);
      setMessage("Oferta incluida na campanha e adicionada ao agendador.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao incluir oferta na campanha.");
    }
  }

  async function generateMessage(offerId: string) {
    setError("");
    setMessage("");
    try {
      const result = await postJson<{ message: string }>(`/offers/${offerId}/generate-message`, { channel: "WHATSAPP" });
      await navigator.clipboard?.writeText(result.message);
      setMessage("Mensagem gerada e copiada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar mensagem.");
    }
  }

  function moveToGenerated(offerId: string, updated: OfferUpdate) {
    const original = offers.find((offer) => offer.id === offerId) ?? generatedOffers.find((offer) => offer.id === offerId);
    const generated = original ? mergeOffer(original, updated) : (updated as Offer);
    setOffers((current) => current.filter((offer) => offer.id !== offerId));
    setGeneratedOffers((current) => upsertOffer(current, generated));
  }

  function updateOfferInLists(updated: OfferUpdate) {
    setOffers((current) => current.map((offer) => (offer.id === updated.id ? mergeOffer(offer, updated) : offer)));
    setGeneratedOffers((current) => current.map((offer) => (offer.id === updated.id ? mergeOffer(offer, updated) : offer)));
  }

  function renderOfferCard(offer: Offer, mode: "pending" | "generated") {
    const generated = mode === "generated";

    return (
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
              <p className="text-sm text-[var(--muted)]">
                {[offer.marketplace.name, offer.product.category].filter(Boolean).join(" - ")}
              </p>
              {offer.affiliateUrl ? (
                <p className="mt-1 line-clamp-1 text-xs text-leaf">Link afiliado pronto</p>
              ) : null}
            </div>
          </div>
          <div className="grid items-center gap-3 md:w-[680px] md:grid-cols-[132px_64px_110px_1fr]">
            <div>
              <p className="text-xs text-[var(--muted)]">Preco</p>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="font-semibold text-ink">{formatCurrency(offer.currentPrice)}</p>
                {hasPrice(offer.oldPrice) ? (
                  <p className="text-xs text-[var(--muted)] line-through">{formatCurrency(offer.oldPrice)}</p>
                ) : null}
                {hasDiscount(offer.discountPercent) ? (
                  <span className="rounded-sm bg-amber/30 px-1.5 py-0.5 text-xs font-semibold text-ink">
                    -{Number(offer.discountPercent).toFixed(0)}%
                  </span>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Score</p>
              <p className="font-semibold">{Number(offer.score ?? 0).toFixed(0)}</p>
            </div>
            <StatusBadge value={offer.status} />
            <div className="flex flex-wrap justify-end gap-2">
              {!generated ? (
                <button
                  className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                  onClick={() => generateAffiliateLink(offer.id)}
                  type="button"
                  title="Gerar link afiliado"
                >
                  <Link2 size={17} aria-hidden />
                </button>
              ) : null}
              {offer.affiliateUrl ? (
                <>
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => copyAffiliateLink(offer)}
                    type="button"
                    title="Copiar link afiliado"
                  >
                    <Clipboard size={17} aria-hidden />
                  </button>
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => window.open(offer.affiliateUrl!, "_blank", "noopener,noreferrer")}
                    type="button"
                    title="Abrir link afiliado"
                  >
                    <ExternalLink size={17} aria-hidden />
                  </button>
                </>
              ) : null}
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
        <div
          className={`mt-3 grid gap-2 border-t border-[var(--border)] pt-3 ${
            generated ? "md:grid-cols-[1fr_auto]" : "md:grid-cols-[1fr_1fr_auto_auto]"
          }`}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Campanha deste item</span>
            <select
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              value={campaignByOffer[offer.id] ?? ""}
              onChange={(event) => setCampaignByOffer({ ...campaignByOffer, [offer.id]: event.target.value })}
            >
              <option value="">Escolher campanha</option>
              {campaigns.map((campaign) => (
                <option value={campaign.id} key={campaign.id}>
                  {campaign.name} - {campaign.channel}
                </option>
              ))}
            </select>
          </label>
          {!generated ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Link afiliado final</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                  value={affiliateUrlByOffer[offer.id] ?? ""}
                  onChange={(event) => setAffiliateUrlByOffer({ ...affiliateUrlByOffer, [offer.id]: event.target.value })}
                  placeholder="Cole aqui"
                  type="url"
                />
              </label>
              <button
                className="focus-ring mt-auto flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                onClick={() => saveAffiliateLink(offer.id)}
                type="button"
                title="Salvar link afiliado"
              >
                <Link2 size={16} aria-hidden />
                Salvar
              </button>
            </>
          ) : null}
          <button
            className="focus-ring mt-auto flex items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 text-sm font-semibold text-white hover:bg-leaf/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!offer.affiliateUrl}
            onClick={() => addOfferToCampaign(offer)}
            type="button"
            title="Incluir na campanha"
          >
            <PlusCircle size={16} aria-hidden />
            Incluir
          </button>
        </div>
      </Panel>
    );
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
            <span className="mb-1 block text-sm font-medium">Categoria</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="fitness, alimentos, suplementos"
              list="garimpo-categorias"
            />
            <datalist id="garimpo-categorias">
              {categoryOptions.map((option) => (
                <option value={option} key={option} />
              ))}
            </datalist>
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

      <section className="mt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Para gerar link</h2>
          <span className="rounded-md bg-mist px-2 py-1 text-xs font-semibold text-leaf">{offers.length} itens</span>
        </div>
        {offers.length ? (
          <div className="grid gap-3">{offers.map((offer) => renderOfferCard(offer, "pending"))}</div>
        ) : (
          <Panel className="text-sm text-[var(--muted)]">
            Nenhuma oferta pendente. Busque novas ofertas ou consulte os links ja gerados abaixo.
          </Panel>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Links gerados</h2>
          <span className="rounded-md bg-amber/30 px-2 py-1 text-xs font-semibold text-ink">
            {generatedOffers.length} itens
          </span>
        </div>
        {generatedOffers.length ? (
          <div className="grid gap-3">{generatedOffers.map((offer) => renderOfferCard(offer, "generated"))}</div>
        ) : (
          <Panel className="text-sm text-[var(--muted)]">Os links gerados vao aparecer aqui para consulta e campanha.</Panel>
        )}
      </section>
    </>
  );
}

function mergeOffer(current: Offer, updated: OfferUpdate): Offer {
  return {
    ...current,
    ...updated,
    product: updated.product ?? current.product,
    marketplace: updated.marketplace ?? current.marketplace
  };
}

function upsertOffer(list: Offer[], offer: Offer) {
  return [offer, ...list.filter((item) => item.id !== offer.id)];
}

async function copyText(value: string) {
  try {
    await navigator.clipboard?.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function numberOrUndefined(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasPrice(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function hasDiscount(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function formatCurrency(value: string | number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Preco indisponivel";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(parsed);
}
