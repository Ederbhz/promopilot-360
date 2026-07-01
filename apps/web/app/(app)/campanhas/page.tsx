"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pause, Play, Plus, Rows3 } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, patchJson, postJson } from "@/lib/api";

interface Marketplace {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
  channel: string;
}

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  intervalMinutes: number;
  dailyLimit: number;
  marketplace?: { name: string } | null;
  template?: { name: string } | null;
  _count?: { scheduledPosts: number };
}

export default function CampanhasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({
    name: "",
    marketplaceId: "",
    templateId: "",
    channel: "WHATSAPP",
    intervalMinutes: 30,
    dailyLimit: 30,
    requireManualApproval: true
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [campaignData, marketplaceData, templateData] = await Promise.all([
      apiFetch<Campaign[]>("/campaigns"),
      apiFetch<Marketplace[]>("/marketplaces"),
      apiFetch<Template[]>("/message-templates")
    ]);
    setCampaigns(campaignData);
    setMarketplaces(marketplaceData);
    setTemplates(templateData);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar campanhas."));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await postJson("/campaigns", {
        ...form,
        marketplaceId: form.marketplaceId || undefined,
        templateId: form.templateId || undefined,
        status: "PAUSED"
      });
      setForm({ ...form, name: "" });
      await load();
      setMessage("Campanha criada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar campanha.");
    }
  }

  async function setStatus(id: string, status: "ACTIVE" | "PAUSED") {
    await patchJson(`/campaigns/${id}/status`, { status });
    await load();
  }

  async function fillQueue(id: string) {
    const result = await postJson<{ count: number }>(`/campaigns/${id}/fill-queue`, { limit: 10 });
    await load();
    setMessage(`${result.count} publicacoes criadas.`);
  }

  return (
    <>
      <PageHeader title="Campanhas" eyebrow="Intervalos" />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <form onSubmit={create} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nome</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Marketplace</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={form.marketplaceId}
                  onChange={(event) => setForm({ ...form, marketplaceId: event.target.value })}
                >
                  <option value="">Todos</option>
                  {marketplaces.map((marketplace) => (
                    <option key={marketplace.id} value={marketplace.id}>
                      {marketplace.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Canal</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={form.channel}
                  onChange={(event) => setForm({ ...form, channel: event.target.value })}
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="TELEGRAM">Telegram</option>
                  <option value="INSTAGRAM">Instagram</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Template</span>
              <select
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.templateId}
                onChange={(event) => setForm({ ...form, templateId: event.target.value })}
              >
                <option value="">Padrao do canal</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Intervalo</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="number"
                  min={5}
                  value={form.intervalMinutes}
                  onChange={(event) => setForm({ ...form, intervalMinutes: Number(event.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Limite diario</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="number"
                  min={1}
                  value={form.dailyLimit}
                  onChange={(event) => setForm({ ...form, dailyLimit: Number(event.target.value) })}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requireManualApproval}
                onChange={(event) => setForm({ ...form, requireManualApproval: event.target.checked })}
              />
              Aprovar antes de enviar
            </label>
            <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90">
              <Plus size={17} aria-hidden />
              Criar campanha
            </button>
          </form>
        </Panel>

        <div className="space-y-3">
          {error ? <ErrorLine message={error} /> : null}
          {message ? <p className="rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
          {campaigns.map((campaign) => (
            <Panel key={campaign.id} className="p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={campaign.status} />
                    <span className="text-sm text-[var(--muted)]">{campaign.channel}</span>
                  </div>
                  <h2 className="font-semibold text-ink">{campaign.name}</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {campaign.marketplace?.name ?? "Todos"} - {campaign.intervalMinutes} min - {campaign._count?.scheduledPosts ?? 0} posts
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => setStatus(campaign.id, campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
                    title={campaign.status === "ACTIVE" ? "Pausar" : "Ativar"}
                  >
                    {campaign.status === "ACTIVE" ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}
                  </button>
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => fillQueue(campaign.id)}
                    title="Preencher fila"
                  >
                    <Rows3 size={17} aria-hidden />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </>
  );
}
