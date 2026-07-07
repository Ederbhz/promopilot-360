"use client";

import { useEffect, useState } from "react";
import { Brain, Clipboard, FileSearch, RefreshCw, Sparkles, Target, TicketPercent, TrendingUp, TriangleAlert } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson } from "@/lib/api";

interface DashboardData {
  cards: {
    championOffers: number;
    recommendedOffers: number;
    suspiciousOffers: number;
    activeCoupons: number;
    couponsEndingToday: number;
    historicLows: number;
    seoDrafts: number;
    openOpportunities: number;
    lowScoreProducts: number;
    realDiscount20: number;
  };
  topRanking: OfferRanking[];
  opportunities: Opportunity[];
}

interface OfferRanking {
  id: string;
  affiliateUrl?: string | null;
  currentPrice?: string | number | null;
  score?: string | number | null;
  couponCode?: string | null;
  freeShipping?: boolean | null;
  product: {
    id: string;
    title: string;
    imageUrl?: string | null;
    categoryRef?: { name: string } | null;
    offerScores?: Array<{ classificacao?: string | null; justificativa?: string | null }>;
    priceHistory?: Array<{ percentualDescontoReal?: string | number | null; statusDesconto?: string | null }>;
  };
  marketplace: { name: string };
}

interface Opportunity {
  id: string;
  tipo?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  prioridade?: string | null;
  status: string;
  product: { title: string; marketplace: { name: string } };
  score?: { scoreTotal: string | number; classificacao?: string | null } | null;
}

export default function InteligenciaPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setData(await apiFetch<DashboardData>("/intelligence/dashboard"));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar inteligencia."));
  }, []);

  async function runJobs() {
    setBusy("jobs");
    setError("");
    setMessage("");
    try {
      const result = await postJson<{ analyzed: number; couponValidation: { expired: number; activated: number } }>(
        "/intelligence/jobs/run",
        { limit: 100 }
      );
      await load();
      setMessage(`${result.analyzed} ofertas analisadas. Cupons: ${result.couponValidation.activated} ativados, ${result.couponValidation.expired} vencidos.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar inteligencia.");
    } finally {
      setBusy("");
    }
  }

  async function analyzeOffer(id: string) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await postJson(`/intelligence/offers/${id}/analyze`, {});
      await load();
      setMessage("Oferta analisada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao analisar oferta.");
    } finally {
      setBusy("");
    }
  }

  if (error && !data) return <ErrorLine message={error} />;
  if (!data) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Inteligencia"
        eyebrow="V2"
        actions={
          <>
            <button
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
              onClick={() => load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao atualizar."))}
              type="button"
            >
              <RefreshCw size={16} aria-hidden />
              Atualizar
            </button>
            <button
              className="focus-ring flex items-center gap-2 rounded-md bg-leaf px-3 py-2 text-sm font-semibold text-white hover:bg-leaf/90 disabled:opacity-60"
              disabled={busy === "jobs"}
              onClick={runJobs}
              type="button"
            >
              <Brain size={16} aria-hidden />
              {busy === "jobs" ? "Analisando..." : "Rodar V2"}
            </button>
          </>
        }
      />
      {error ? <div className="mb-4"><ErrorLine message={error} /></div> : null}
      {message ? <p className="mb-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Ofertas campeas" value={data.cards.championOffers} icon={Sparkles} tone="saffron" />
        <MetricCard label="Recomendadas" value={data.cards.recommendedOffers} icon={Target} tone="leaf" />
        <MetricCard label="Suspeitas" value={data.cards.suspiciousOffers} icon={TriangleAlert} tone="coral" />
        <MetricCard label="Cupons ativos" value={data.cards.activeCoupons} icon={TicketPercent} tone="ink" />
        <MetricCard label="Rascunhos SEO" value={data.cards.seoDrafts} icon={FileSearch} tone="leaf" />
        <MetricCard label="Menor historico" value={data.cards.historicLows} icon={TrendingUp} tone="saffron" />
        <MetricCard label="Desconto real 20%" value={data.cards.realDiscount20} icon={TrendingUp} tone="leaf" />
        <MetricCard label="Baixo score" value={data.cards.lowScoreProducts} icon={TriangleAlert} tone="coral" />
        <MetricCard label="Oportunidades" value={data.cards.openOpportunities} icon={Brain} tone="ink" />
        <MetricCard label="Vencem hoje" value={data.cards.couponsEndingToday} icon={TicketPercent} tone="saffron" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <h2 className="mb-4 font-semibold text-ink">Ranking de ofertas</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3">Marketplace</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Desconto real</th>
                  <th className="py-2 pr-3">Classificacao</th>
                  <th className="py-2 pr-3">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.topRanking.map((offer) => {
                  const score = offer.product.offerScores?.[0];
                  const history = offer.product.priceHistory?.[0];
                  return (
                    <tr key={offer.id}>
                      <td className="max-w-[280px] py-3 pr-3 font-medium">{offer.product.title}</td>
                      <td className="py-3 pr-3">{offer.marketplace.name}</td>
                      <td className="py-3 pr-3">{Number(offer.score ?? 0).toFixed(0)}</td>
                      <td className="py-3 pr-3">{Number(history?.percentualDescontoReal ?? 0).toFixed(0)}%</td>
                      <td className="py-3 pr-3">
                        <StatusBadge value={score?.classificacao ?? history?.statusDesconto ?? "sem_historico"} />
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex gap-2">
                          <button
                            className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                            onClick={() => analyzeOffer(offer.id)}
                            title="Analisar"
                            type="button"
                          >
                            <Brain size={16} aria-hidden />
                          </button>
                          <button
                            className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                            onClick={() => navigator.clipboard?.writeText(offer.affiliateUrl || "")}
                            title="Copiar link"
                            type="button"
                          >
                            <Clipboard size={16} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-4 font-semibold text-ink">Oportunidades</h2>
          <div className="space-y-3">
            {data.opportunities.map((opportunity) => (
              <div key={opportunity.id} className="rounded-md border border-[var(--border)] px-3 py-2">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge value={opportunity.prioridade ?? "baixa"} />
                  <span className="text-xs text-[var(--muted)]">{opportunity.tipo}</span>
                </div>
                <h3 className="font-semibold text-ink">{opportunity.titulo ?? opportunity.product.title}</h3>
                <p className="text-sm text-[var(--muted)]">{opportunity.descricao}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {opportunity.product.marketplace.name} - score {Number(opportunity.score?.scoreTotal ?? 0).toFixed(0)}
                </p>
              </div>
            ))}
            {!data.opportunities.length ? <p className="text-sm text-[var(--muted)]">Nenhuma oportunidade aberta.</p> : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
