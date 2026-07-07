"use client";

import clsx from "clsx";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, Copy, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { apiFetch, deleteJson, postJson } from "@/lib/api";

interface Product {
  id: string;
  title: string;
  marketplace: { name: string };
}

interface Offer {
  id: string;
  affiliateUrl?: string | null;
  product: { title: string };
  marketplace: { name: string };
}

interface GeneratedContent {
  id: string;
  title: string;
  channel: string;
  tone?: string | null;
  content: string;
  createdAt: string;
  offer?: { id: string; product: { title: string }; marketplace: { name: string } } | null;
  product?: { id: string; title: string; marketplace: { name: string } } | null;
}

type SourceType = "offer" | "product" | "manual";

const emptyManual = {
  productTitle: "",
  productUrl: "",
  affiliateUrl: "",
  marketplaceName: "",
  category: "",
  currentPrice: "",
  oldPrice: "",
  discountPercent: "",
  couponCode: ""
};

export default function IaPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [sourceType, setSourceType] = useState<SourceType>("offer");
  const [offerId, setOfferId] = useState("");
  const [productId, setProductId] = useState("");
  const [channel, setChannel] = useState("WHATSAPP");
  const [tone, setTone] = useState("promocional");
  const [prompt, setPrompt] = useState("");
  const [manual, setManual] = useState(emptyManual);
  const [selectedContent, setSelectedContent] = useState<GeneratedContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [productData, offerData, contentData] = await Promise.all([
      apiFetch<Product[]>("/products"),
      apiFetch<Offer[]>("/offers?scope=generated"),
      apiFetch<GeneratedContent[]>("/ai/generated-contents")
    ]);
    setProducts(productData);
    setOffers(offerData);
    setContents(contentData);
    setOfferId((current) => current || offerData[0]?.id || "");
    setProductId((current) => current || productData[0]?.id || "");
    setSelectedContent((current) => current ?? contentData[0] ?? null);
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar IA."))
      .finally(() => setLoading(false));
  }, []);

  const sourceOptions = useMemo(
    () => [
      { value: "offer" as const, label: "Oferta" },
      { value: "product" as const, label: "Produto" },
      { value: "manual" as const, label: "Manual" }
    ],
    []
  );

  async function generateContent(event: FormEvent) {
    event.preventDefault();
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        channel,
        tone,
        prompt: blankToUndefined(prompt),
        ...(sourceType === "offer" ? { offerId } : {}),
        ...(sourceType === "product" ? { productId } : {}),
        ...(sourceType === "manual"
          ? {
              productTitle: manual.productTitle,
              productUrl: blankToUndefined(manual.productUrl),
              affiliateUrl: blankToUndefined(manual.affiliateUrl),
              marketplaceName: blankToUndefined(manual.marketplaceName),
              category: blankToUndefined(manual.category),
              currentPrice: numberOrUndefined(manual.currentPrice),
              oldPrice: numberOrUndefined(manual.oldPrice),
              discountPercent: numberOrUndefined(manual.discountPercent),
              couponCode: blankToUndefined(manual.couponCode)
            }
          : {})
      };
      const generated = await postJson<GeneratedContent>("/ai/generate", payload);
      setContents((current) => [generated, ...current.filter((item) => item.id !== generated.id)]);
      setSelectedContent(generated);
      setMessage("Conteudo gerado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar conteudo.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyContent(content = selectedContent) {
    if (!content) return;
    try {
      await navigator.clipboard?.writeText(content.content);
      setMessage("Conteudo copiado.");
      setError("");
    } catch {
      setError("Nao foi possivel copiar automaticamente.");
    }
  }

  async function removeContent(content: GeneratedContent) {
    if (!window.confirm(`Arquivar "${content.title}"?`)) return;
    setError("");
    setMessage("");
    try {
      await deleteJson<void>(`/ai/generated-contents/${content.id}`);
      setContents((current) => current.filter((item) => item.id !== content.id));
      setSelectedContent((current) => (current?.id === content.id ? null : current));
      setMessage("Conteudo arquivado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao arquivar conteudo.");
    }
  }

  if (loading) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="IA"
        eyebrow="Conteudo"
        actions={
          <button
            className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
            onClick={() => load()}
            type="button"
          >
            <RefreshCw size={16} aria-hidden />
            Atualizar
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel>
          <form onSubmit={generateContent} className="space-y-3">
            <div className="flex rounded-md border border-[var(--border)] p-1">
              {sourceOptions.map((option) => (
                <button
                  className={clsx(
                    "focus-ring flex-1 rounded-sm px-3 py-2 text-sm font-semibold transition",
                    sourceType === option.value ? "bg-leaf text-white" : "hover:bg-mist"
                  )}
                  key={option.value}
                  onClick={() => setSourceType(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            {sourceType === "offer" ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Oferta</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={offerId}
                  onChange={(event) => setOfferId(event.target.value)}
                  required
                >
                  {offers.map((offer) => (
                    <option value={offer.id} key={offer.id}>
                      {offer.product.title} - {offer.marketplace.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {sourceType === "product" ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Produto</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  required
                >
                  {products.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.title} - {product.marketplace.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {sourceType === "manual" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium">Produto</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={manual.productTitle}
                    onChange={(event) => setManual({ ...manual, productTitle: event.target.value })}
                    required
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium">Marketplace</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={manual.marketplaceName}
                    onChange={(event) => setManual({ ...manual, marketplaceName: event.target.value })}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium">Categoria</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={manual.category}
                    onChange={(event) => setManual({ ...manual, category: event.target.value })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium">Link</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={manual.productUrl}
                    onChange={(event) => setManual({ ...manual, productUrl: event.target.value })}
                    type="url"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium">Preco atual</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    inputMode="decimal"
                    value={manual.currentPrice}
                    onChange={(event) => setManual({ ...manual, currentPrice: event.target.value })}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium">Preco antigo</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    inputMode="decimal"
                    value={manual.oldPrice}
                    onChange={(event) => setManual({ ...manual, oldPrice: event.target.value })}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium">Desconto</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    inputMode="decimal"
                    value={manual.discountPercent}
                    onChange={(event) => setManual({ ...manual, discountPercent: event.target.value })}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium">Cupom</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={manual.couponCode}
                    onChange={(event) => setManual({ ...manual, couponCode: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-medium">Canal</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="TELEGRAM">Telegram</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">Tom</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                >
                  <option value="promocional">Promocional</option>
                  <option value="urgente">Urgente</option>
                  <option value="premium">Premium</option>
                  <option value="direto">Direto</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Prompt</span>
              <textarea
                className="focus-ring min-h-[92px] w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <button
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-70"
              disabled={generating}
            >
              <Sparkles size={17} aria-hidden />
              {generating ? "Gerando..." : "Gerar conteudo"}
            </button>
          </form>

          {error ? <div className="mt-4"><ErrorLine message={error} /></div> : null}
          {message ? <p className="mt-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
        </Panel>

        <Panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-leaf" aria-hidden />
              <h2 className="text-base font-semibold text-ink">Conteudo</h2>
            </div>
            <button
              className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist disabled:opacity-50"
              disabled={!selectedContent}
              onClick={() => copyContent()}
              type="button"
              title="Copiar"
            >
              <Copy size={16} aria-hidden />
            </button>
          </div>
          <textarea
            className="focus-ring min-h-[360px] w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
            readOnly
            value={selectedContent?.content ?? ""}
          />
        </Panel>
      </div>

      <Panel className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3">Titulo</th>
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2 pr-3">Canal</th>
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {contents.map((content) => (
                <tr key={content.id} className={selectedContent?.id === content.id ? "bg-mist/60" : undefined}>
                  <td className="max-w-[320px] py-3 pr-3 font-medium">{content.title}</td>
                  <td className="py-3 pr-3">{content.offer?.marketplace.name ?? content.product?.marketplace.name ?? "-"}</td>
                  <td className="py-3 pr-3">{content.channel}</td>
                  <td className="py-3 pr-3">{formatDate(content.createdAt)}</td>
                  <td className="py-3 pr-3">
                    <div className="flex justify-end gap-2">
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => setSelectedContent(content)}
                        type="button"
                        title="Abrir"
                      >
                        <Bot size={16} aria-hidden />
                      </button>
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => copyContent(content)}
                        type="button"
                        title="Copiar"
                      >
                        <Copy size={16} aria-hidden />
                      </button>
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => removeContent(content)}
                        type="button"
                        title="Arquivar"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function blankToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function numberOrUndefined(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
