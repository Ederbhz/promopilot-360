"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, Pause, Play, Plus, Rows3, X } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, patchJson, postJson, putJson } from "@/lib/api";

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
  startTime?: string | null;
  endTime?: string | null;
  intervalMinutes: number;
  dailyLimit: number;
  requireManualApproval: boolean;
  marketplace?: { name: string } | null;
  marketplaceId?: string | null;
  template?: { name: string } | null;
  templateId?: string | null;
  config?: { instagramSurface?: string } | null;
  whatsappGroups?: Array<{ group: WhatsAppGroup }>;
  _count?: { scheduledPosts: number };
}

interface WhatsAppGroup {
  id: string;
  name: string;
  isActive: boolean;
}

export default function CampanhasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[]>([]);
  const [editingCampaignId, setEditingCampaignId] = useState("");
  const [form, setForm] = useState({
    name: "",
    marketplaceId: "",
    templateId: "",
    channel: "WHATSAPP",
    startTime: "09:00",
    endTime: "17:00",
    intervalMinutes: 60,
    dailyLimit: 30,
    requireManualApproval: false,
    instagramSurface: "FEED",
    whatsappGroupIds: [] as string[]
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [campaignData, marketplaceData, templateData, whatsappGroupData] = await Promise.all([
      apiFetch<Campaign[]>("/campaigns"),
      apiFetch<Marketplace[]>("/marketplaces"),
      apiFetch<Template[]>("/message-templates"),
      apiFetch<WhatsAppGroup[]>("/whatsapp/groups")
    ]);
    setCampaigns(campaignData);
    setMarketplaces(marketplaceData);
    setTemplates(templateData);
    setWhatsappGroups(whatsappGroupData.filter((group) => group.isActive));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar campanhas."));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const body = {
        marketplaceId: form.marketplaceId || undefined,
        name: form.name,
        templateId: form.templateId || undefined,
        channel: form.channel,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        intervalMinutes: form.intervalMinutes,
        dailyLimit: form.dailyLimit,
        requireManualApproval: form.requireManualApproval,
        config: form.channel === "INSTAGRAM" ? { instagramSurface: form.instagramSurface } : undefined,
        whatsappGroupIds: form.channel === "WHATSAPP" ? form.whatsappGroupIds : [],
        status: "PAUSED"
      };
      if (editingCampaignId) {
        await putJson(`/campaigns/${editingCampaignId}`, body);
      } else {
        await postJson("/campaigns", body);
      }
      resetForm();
      await load();
      setMessage(editingCampaignId ? "Campanha atualizada." : "Campanha criada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar campanha.");
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

  function editCampaign(campaign: Campaign) {
    setEditingCampaignId(campaign.id);
    setForm({
      name: campaign.name,
      marketplaceId: campaign.marketplaceId ?? "",
      templateId: campaign.templateId ?? "",
      channel: campaign.channel,
      startTime: campaign.startTime ?? "09:00",
      endTime: campaign.endTime ?? "17:00",
      intervalMinutes: campaign.intervalMinutes,
      dailyLimit: campaign.dailyLimit,
      requireManualApproval: campaign.requireManualApproval,
      instagramSurface: campaign.config?.instagramSurface === "STORY" ? "STORY" : "FEED",
      whatsappGroupIds: campaign.whatsappGroups?.map((item) => item.group.id) ?? []
    });
  }

  function resetForm() {
    setEditingCampaignId("");
    setForm({
      name: "",
      marketplaceId: "",
      templateId: "",
      channel: "WHATSAPP",
      startTime: "09:00",
      endTime: "17:00",
      intervalMinutes: 60,
      dailyLimit: 30,
      requireManualApproval: false,
      instagramSurface: "FEED",
      whatsappGroupIds: []
    });
  }

  function toggleGroup(id: string) {
    setForm((current) => ({
      ...current,
      whatsappGroupIds: current.whatsappGroupIds.includes(id)
        ? current.whatsappGroupIds.filter((item) => item !== id)
        : [...current.whatsappGroupIds, id]
    }));
  }

  return (
    <>
      <PageHeader title="Campanhas" eyebrow="Intervalos" />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <form onSubmit={save} className="space-y-3">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Horario de inicio</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Horario de termino</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="time"
                  value={form.endTime}
                  onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                />
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
                <span className="mb-1 block text-sm font-medium">Intervalo de envio</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={form.intervalMinutes}
                  onChange={(event) => setForm({ ...form, intervalMinutes: Number(event.target.value) })}
                >
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>60 minutos</option>
                  <option value={120}>120 minutos</option>
                </select>
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
            {form.channel === "INSTAGRAM" ? (
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <span className="block text-sm font-medium">Destino Instagram</span>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-[var(--border)] bg-mist p-1">
                  <button
                    className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${
                      form.instagramSurface === "FEED" ? "bg-white text-leaf shadow-soft" : "text-[var(--muted)] hover:bg-white"
                    }`}
                    onClick={() => setForm({ ...form, instagramSurface: "FEED" })}
                    type="button"
                  >
                    Feed
                  </button>
                  <button
                    className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${
                      form.instagramSurface === "STORY" ? "bg-white text-leaf shadow-soft" : "text-[var(--muted)] hover:bg-white"
                    }`}
                    onClick={() => setForm({ ...form, instagramSurface: "STORY" })}
                    type="button"
                  >
                    Stories
                  </button>
                </div>
              </div>
            ) : null}
            {form.channel === "WHATSAPP" ? (
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Grupos para envio</span>
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-mist"
                    onClick={() => setForm({ ...form, whatsappGroupIds: whatsappGroups.map((group) => group.id) })}
                    type="button"
                  >
                    Selecionar todos
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {whatsappGroups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.whatsappGroupIds.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90">
              <Plus size={17} aria-hidden />
              {editingCampaignId ? "Salvar campanha" : "Criar campanha"}
            </button>
            {editingCampaignId ? (
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-semibold hover:bg-mist"
                onClick={resetForm}
                type="button"
              >
                <X size={17} aria-hidden />
                Cancelar edicao
              </button>
            ) : null}
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
                  {campaign.channel === "WHATSAPP" && campaign.whatsappGroups?.length ? (
                    <p className="text-xs text-[var(--muted)]">
                      {campaign.whatsappGroups.map((item) => item.group.name).join(", ")}
                    </p>
                  ) : null}
                  {campaign.channel === "INSTAGRAM" ? (
                    <p className="text-xs text-[var(--muted)]">
                      Destino: {campaign.config?.instagramSurface === "STORY" ? "Stories" : "Feed"}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => editCampaign(campaign)}
                    title="Editar campanha"
                  >
                    <Edit3 size={17} aria-hidden />
                  </button>
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
