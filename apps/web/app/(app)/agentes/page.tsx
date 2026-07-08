"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Cpu, Database, Gauge, Play, RefreshCw, Save, Sparkles, XCircle } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson, putJson } from "@/lib/api";

interface AgentList {
  agents: string[];
}

interface AgentRun {
  id: string;
  agentName: string;
  status: string;
  errorMessage?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  estimatedCost?: string | number | null;
  createdAt: string;
}

interface Recommendation {
  id: string;
  recommendationType?: string | null;
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  confidence?: string | number | null;
  agentName?: string | null;
  status: string;
  product?: { title: string; marketplace?: { name: string } } | null;
}

interface Policy {
  id: string;
  mode: string;
  dailyPublicationLimit: number;
  allowedChannels: string[];
  minScore: string | number;
  minCommission?: string | number | null;
  startTime?: string | null;
  endTime?: string | null;
  requireCoupon: boolean;
  dailyAiCostLimit: string | number;
}

interface AnalyticsOverview {
  cards: {
    estimatedRevenue: number;
    estimatedCommission: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversionRate: number;
    bestMarketplace: string;
    bestCategory: string;
    bestHour: string;
    bestProduct: string;
    agentRuns: number;
    acceptedRecommendations: number;
    rejectedRecommendations: number;
    aiCost: number;
    estimatedRoi: number;
  };
  channels: Array<{ key: string; clicks: number; impressions: number; ctr: number }>;
}

const channelOptions = ["TELEGRAM", "WHATSAPP", "INSTAGRAM", "FACEBOOK"];

export default function AgentesPage() {
  const [agents, setAgents] = useState<string[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const pendingRecommendations = useMemo(
    () => recommendations.filter((item) => item.status === "pending"),
    [recommendations]
  );

  async function load() {
    const [agentData, runData, recommendationData, policyData, overviewData] = await Promise.all([
      apiFetch<AgentList>("/agents"),
      apiFetch<AgentRun[]>("/agents/runs"),
      apiFetch<Recommendation[]>("/ai/recommendations"),
      apiFetch<Policy>("/agents/policy"),
      apiFetch<AnalyticsOverview>("/analytics/overview")
    ]);
    setAgents(agentData.agents);
    setRuns(runData);
    setRecommendations(recommendationData);
    setPolicy(policyData);
    setOverview(overviewData);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar agentes."));
  }, []);

  async function runAgent(agent: string) {
    setBusy(agent);
    setError("");
    setMessage("");
    try {
      await postJson(`/agents/${agent}/run`, { limit: 20 });
      await load();
      setMessage(`${agent} executado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar agente.");
    } finally {
      setBusy("");
    }
  }

  async function recommendationAction(id: string, action: "accept" | "reject" | "execute") {
    setBusy(`${action}-${id}`);
    setError("");
    setMessage("");
    try {
      await postJson(`/ai/recommendations/${id}/${action}`, action === "reject" ? { reason: "Rejeitada no painel." } : {});
      await load();
      setMessage(action === "execute" ? "Recomendacao executada." : "Recomendacao atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar recomendacao.");
    } finally {
      setBusy("");
    }
  }

  async function runMlAction(path: string, label: string) {
    setBusy(path);
    setError("");
    setMessage("");
    try {
      await postJson(path, { limit: 200 });
      await load();
      setMessage(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar acao.");
    } finally {
      setBusy("");
    }
  }

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    if (!policy) return;
    setBusy("policy");
    setError("");
    setMessage("");
    try {
      await putJson("/agents/policy", {
        mode: policy.mode,
        dailyPublicationLimit: Number(policy.dailyPublicationLimit),
        allowedChannels: policy.allowedChannels,
        minScore: Number(policy.minScore),
        minCommission: policy.minCommission === null || policy.minCommission === "" ? null : Number(policy.minCommission),
        startTime: policy.startTime || null,
        endTime: policy.endTime || null,
        requireCoupon: policy.requireCoupon,
        dailyAiCostLimit: Number(policy.dailyAiCostLimit)
      });
      await load();
      setMessage("Politica de autonomia salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar politica.");
    } finally {
      setBusy("");
    }
  }

  function toggleChannel(channel: string) {
    if (!policy) return;
    const allowedChannels = policy.allowedChannels.includes(channel)
      ? policy.allowedChannels.filter((item) => item !== channel)
      : [...policy.allowedChannels, channel];
    setPolicy({ ...policy, allowedChannels });
  }

  if (error && !overview) return <ErrorLine message={error} />;
  if (!overview || !policy) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Agentes"
        eyebrow="V4"
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
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
              onClick={() => runMlAction("/ml/train", "Modelo ML treinado.")}
              type="button"
            >
              <Cpu size={16} aria-hidden />
              Treinar ML
            </button>
            <button
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
              onClick={() => runMlAction("/ml/vector-documents/index", "Memoria vetorial atualizada.")}
              type="button"
            >
              <Database size={16} aria-hidden />
              Indexar
            </button>
          </>
        }
      />
      {error ? <div className="mb-4"><ErrorLine message={error} /></div> : null}
      {message ? <p className="mb-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Cliques" value={overview.cards.clicks} icon={Gauge} tone="leaf" />
        <MetricCard label="CTR geral" value={`${overview.cards.ctr}%`} icon={Sparkles} tone="saffron" />
        <MetricCard label="Comissao est." value={formatMoney(overview.cards.estimatedCommission)} icon={Gauge} tone="ink" />
        <MetricCard label="Custo IA" value={formatMoney(overview.cards.aiCost)} icon={Cpu} tone="coral" />
        <MetricCard label="ROI est." value={`${overview.cards.estimatedRoi}%`} icon={Sparkles} tone="leaf" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-4">
          <Panel>
            <h2 className="mb-3 font-semibold text-ink">Comando</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {agents.map((agent) => (
                <button
                  key={agent}
                  className="focus-ring flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-left text-sm font-semibold hover:bg-mist disabled:opacity-60"
                  disabled={busy === agent}
                  onClick={() => runAgent(agent)}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    <Bot size={16} aria-hidden />
                    {agent}
                  </span>
                  <Play size={16} aria-hidden />
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <form onSubmit={savePolicy} className="space-y-3">
              <h2 className="font-semibold text-ink">Autonomia</h2>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Modo</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={policy.mode}
                  onChange={(event) => setPolicy({ ...policy, mode: event.target.value })}
                >
                  <option value="manual">Manual</option>
                  <option value="assistido">Assistido</option>
                  <option value="semi_autonomo">Semi-autonomo</option>
                  <option value="autonomo_controlado">Autonomo controlado</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Score minimo</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="number"
                    value={policy.minScore}
                    onChange={(event) => setPolicy({ ...policy, minScore: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Limite diario</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="number"
                    value={policy.dailyPublicationLimit}
                    onChange={(event) => setPolicy({ ...policy, dailyPublicationLimit: Number(event.target.value) })}
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {channelOptions.map((channel) => (
                  <label key={channel} className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                    <input type="checkbox" checked={policy.allowedChannels.includes(channel)} onChange={() => toggleChannel(channel)} />
                    {channel}
                  </label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Inicio</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="time"
                    value={policy.startTime ?? ""}
                    onChange={(event) => setPolicy({ ...policy, startTime: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Fim</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="time"
                    value={policy.endTime ?? ""}
                    onChange={(event) => setPolicy({ ...policy, endTime: event.target.value })}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Limite custo IA</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="number"
                  value={policy.dailyAiCostLimit}
                  onChange={(event) => setPolicy({ ...policy, dailyAiCostLimit: event.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policy.requireCoupon}
                  onChange={(event) => setPolicy({ ...policy, requireCoupon: event.target.checked })}
                />
                Exigir cupom
              </label>
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90"
                disabled={busy === "policy"}
              >
                <Save size={17} aria-hidden />
                Salvar autonomia
              </button>
            </form>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-ink">Recomendacoes</h2>
              <span className="text-sm text-[var(--muted)]">{pendingRecommendations.length} pendentes</span>
            </div>
            <div className="space-y-3">
              {recommendations.slice(0, 30).map((recommendation) => (
                <div key={recommendation.id} className="rounded-md border border-[var(--border)] px-3 py-2">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge value={recommendation.status} />
                        <span className="text-xs text-[var(--muted)]">{recommendation.agentName}</span>
                        <span className="text-xs text-[var(--muted)]">{recommendation.priority}</span>
                        <span className="text-xs text-[var(--muted)]">{Number(recommendation.confidence ?? 0).toFixed(0)}%</span>
                      </div>
                      <h3 className="font-semibold text-ink">{recommendation.title}</h3>
                      <p className="text-sm text-[var(--muted)]">{recommendation.description}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {recommendation.product?.title || recommendation.recommendationType}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => recommendationAction(recommendation.id, "accept")}
                        title="Aceitar"
                        type="button"
                      >
                        <CheckCircle2 size={16} aria-hidden />
                      </button>
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => recommendationAction(recommendation.id, "execute")}
                        title="Executar"
                        type="button"
                      >
                        <Play size={16} aria-hidden />
                      </button>
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => recommendationAction(recommendation.id, "reject")}
                        title="Rejeitar"
                        type="button"
                      >
                        <XCircle size={16} aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!recommendations.length ? <p className="text-sm text-[var(--muted)]">Nenhuma recomendacao gerada.</p> : null}
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-3 font-semibold text-ink">Execucoes</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-3">Agente</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Tokens</th>
                    <th className="py-2 pr-3">Custo</th>
                    <th className="py-2 pr-3">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {runs.slice(0, 20).map((run) => (
                    <tr key={run.id}>
                      <td className="py-3 pr-3 font-medium">{run.agentName}</td>
                      <td className="py-3 pr-3"><StatusBadge value={run.status} /></td>
                      <td className="py-3 pr-3">{(run.tokensInput ?? 0) + (run.tokensOutput ?? 0)}</td>
                      <td className="py-3 pr-3">{formatMoney(Number(run.estimatedCost ?? 0))}</td>
                      <td className="py-3 pr-3">{new Date(run.createdAt).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 }).format(value);
}
