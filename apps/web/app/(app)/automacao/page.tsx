"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Clipboard, Image as ImageIcon, Mail, Play, Plus, RadioTower, RefreshCw, Repeat2, Rocket, Trash2 } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson, putJson } from "@/lib/api";

interface Product {
  id: string;
  title: string;
  imageUrl?: string | null;
  marketplace?: { name: string };
}

interface Offer {
  id: string;
  affiliateUrl?: string | null;
  product: { id: string; title: string; imageUrl?: string | null };
  marketplace: { name: string };
}

interface CreativeAsset {
  id: string;
  type: string;
  fileUrl?: string | null;
  prompt?: string | null;
  status: string;
  channel?: string | null;
  product?: { title: string; imageUrl?: string | null; marketplace?: { name: string } } | null;
}

interface PublicationSchedule {
  id: string;
  channel: string;
  message?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  status: string;
  attempts: number;
  errorMessage?: string | null;
  product?: { title: string; imageUrl?: string | null; marketplace?: { name: string } } | null;
  offer?: { product: { title: string; imageUrl?: string | null }; marketplace: { name: string } } | null;
  creativeAsset?: CreativeAsset | null;
}

interface AutomationDashboard {
  cards: {
    scheduled: number;
    published: number;
    failed: number;
    readyCreatives: number;
    pendingCreatives: number;
    dueNow: number;
  };
  schedules: PublicationSchedule[];
  creatives: CreativeAsset[];
  logs: Array<{ id: string; operation: string; status: string; errorMessage?: string | null; createdAt: string }>;
}

const emptyScheduleForm = {
  offerId: "",
  creativeAssetId: "",
  channel: "TELEGRAM",
  scheduledAt: localDateTimeValue(new Date(Date.now() + 10 * 60_000)),
  message: ""
};

const emptyCreativeForm = {
  productId: "",
  type: "IMAGE",
  channel: "INSTAGRAM",
  fileUrl: "",
  prompt: ""
};

export default function AutomacaoPage() {
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [creativeForm, setCreativeForm] = useState(emptyCreativeForm);
  const [newsletter, setNewsletter] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const creativeOptions = useMemo(() => dashboard?.creatives ?? [], [dashboard?.creatives]);

  async function load() {
    const [dashboardData, offerData, productData] = await Promise.all([
      apiFetch<AutomationDashboard>("/automation/dashboard"),
      apiFetch<Offer[]>("/offers?scope=generated"),
      apiFetch<Product[]>("/products")
    ]);
    setDashboard(dashboardData);
    setOffers(offerData);
    setProducts(productData);
    setScheduleForm((current) => ({ ...current, offerId: current.offerId || offerData[0]?.id || "" }));
    setCreativeForm((current) => ({ ...current, productId: current.productId || productData[0]?.id || "" }));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar automacao."));
  }, []);

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    setBusy("schedule");
    setError("");
    setMessage("");
    try {
      await postJson("/automation/publication-schedule", {
        offerId: scheduleForm.offerId,
        creativeAssetId: scheduleForm.creativeAssetId || undefined,
        channel: scheduleForm.channel,
        scheduledAt: new Date(scheduleForm.scheduledAt).toISOString(),
        message: scheduleForm.message || undefined
      });
      setScheduleForm({ ...emptyScheduleForm, offerId: offers[0]?.id || "" });
      await load();
      setMessage("Publicacao agendada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao agendar publicacao.");
    } finally {
      setBusy("");
    }
  }

  async function generateCreative(event: FormEvent) {
    event.preventDefault();
    setBusy("creative");
    setError("");
    setMessage("");
    try {
      await postJson("/automation/creative-assets/generate", {
        productId: creativeForm.productId,
        type: creativeForm.type,
        channel: creativeForm.channel,
        prompt: creativeForm.prompt || undefined,
        fileUrl: creativeForm.fileUrl || undefined
      });
      setCreativeForm({ ...emptyCreativeForm, productId: products[0]?.id || "" });
      await load();
      setMessage("Criativo gerado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar criativo.");
    } finally {
      setBusy("");
    }
  }

  async function publishNow(id: string) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await postJson(`/automation/publication-schedule/${id}/publish-now`, {});
      await load();
      setMessage("Publicacao processada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar.");
    } finally {
      setBusy("");
    }
  }

  async function cancelSchedule(id: string) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await postJson(`/automation/publication-schedule/${id}/cancel`, {});
      await load();
      setMessage("Publicacao cancelada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar.");
    } finally {
      setBusy("");
    }
  }

  async function approveCreative(id: string) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await putJson(`/automation/creative-assets/${id}/approve`, {});
      await load();
      setMessage("Criativo aprovado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar criativo.");
    } finally {
      setBusy("");
    }
  }

  async function runJob(path: string, label: string) {
    setBusy(path);
    setError("");
    setMessage("");
    try {
      await postJson(path, {});
      await load();
      setMessage(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar job.");
    } finally {
      setBusy("");
    }
  }

  async function buildNewsletter() {
    setBusy("newsletter");
    setError("");
    setMessage("");
    try {
      const result = await postJson<{ subject: string; body: string }>("/automation/newsletter/send", { limit: 8 });
      setNewsletter(result);
      setMessage("Newsletter gerada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar newsletter.");
    } finally {
      setBusy("");
    }
  }

  if (error && !dashboard) return <ErrorLine message={error} />;
  if (!dashboard) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Automacao"
        eyebrow="V3"
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
              onClick={() => runJob("/automation/jobs/publish-queue", "Fila de publicacao processada.")}
              type="button"
            >
              <RadioTower size={16} aria-hidden />
              Publish queue
            </button>
            <button
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
              onClick={() => runJob("/automation/jobs/retry-publication", "Retentativas processadas.")}
              type="button"
            >
              <Repeat2 size={16} aria-hidden />
              Retry
            </button>
          </>
        }
      />

      {error ? <div className="mb-4"><ErrorLine message={error} /></div> : null}
      {message ? <p className="mb-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Agendadas" value={dashboard.cards.scheduled} icon={RadioTower} tone="leaf" />
        <MetricCard label="Vencidas agora" value={dashboard.cards.dueNow} icon={Play} tone="saffron" />
        <MetricCard label="Publicadas" value={dashboard.cards.published} icon={Rocket} tone="ink" />
        <MetricCard label="Falhas" value={dashboard.cards.failed} icon={Repeat2} tone="coral" />
        <MetricCard label="Criativos prontos" value={dashboard.cards.readyCreatives} icon={ImageIcon} tone="leaf" />
        <MetricCard label="Pendentes" value={dashboard.cards.pendingCreatives} icon={ImageIcon} tone="saffron" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-4">
          <Panel>
            <form onSubmit={generateCreative} className="space-y-3">
              <h2 className="font-semibold text-ink">Criativo</h2>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Produto</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={creativeForm.productId}
                  onChange={(event) => setCreativeForm({ ...creativeForm, productId: event.target.value })}
                  required
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Tipo</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={creativeForm.type}
                    onChange={(event) => setCreativeForm({ ...creativeForm, type: event.target.value })}
                  >
                    <option value="IMAGE">Imagem</option>
                    <option value="STORY">Story</option>
                    <option value="FEED">Feed</option>
                    <option value="NEWSLETTER">Newsletter</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Canal</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={creativeForm.channel}
                    onChange={(event) => setCreativeForm({ ...creativeForm, channel: event.target.value })}
                  >
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="TELEGRAM">Telegram</option>
                    <option value="NEWSLETTER">Newsletter</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Imagem publica</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="url"
                  value={creativeForm.fileUrl}
                  onChange={(event) => setCreativeForm({ ...creativeForm, fileUrl: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Prompt</span>
                <textarea
                  className="focus-ring min-h-24 w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={creativeForm.prompt}
                  onChange={(event) => setCreativeForm({ ...creativeForm, prompt: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-60"
                disabled={busy === "creative"}
              >
                <Plus size={17} aria-hidden />
                {busy === "creative" ? "Gerando..." : "Gerar criativo"}
              </button>
            </form>
          </Panel>

          <Panel>
            <form onSubmit={createSchedule} className="space-y-3">
              <h2 className="font-semibold text-ink">Agendamento</h2>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Oferta</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={scheduleForm.offerId}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, offerId: event.target.value })}
                  required
                >
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.product.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Canal</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={scheduleForm.channel}
                    onChange={(event) => setScheduleForm({ ...scheduleForm, channel: event.target.value })}
                  >
                    <option value="TELEGRAM">Telegram</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Data</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="datetime-local"
                    value={scheduleForm.scheduledAt}
                    onChange={(event) => setScheduleForm({ ...scheduleForm, scheduledAt: event.target.value })}
                    required
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Criativo</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={scheduleForm.creativeAssetId}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, creativeAssetId: event.target.value })}
                >
                  <option value="">Sem criativo</option>
                  {creativeOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.product?.title ?? asset.type} - {asset.status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Mensagem</span>
                <textarea
                  className="focus-ring min-h-24 w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={scheduleForm.message}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, message: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-saffron px-3 py-2 font-semibold text-white hover:bg-saffron/90 disabled:opacity-60"
                disabled={busy === "schedule"}
              >
                <RadioTower size={17} aria-hidden />
                {busy === "schedule" ? "Agendando..." : "Agendar publicacao"}
              </button>
            </form>
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-ink">Newsletter</h2>
              <button
                className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                onClick={buildNewsletter}
                type="button"
              >
                <Mail size={16} aria-hidden />
                Gerar
              </button>
            </div>
            {newsletter ? (
              <div className="space-y-2">
                <p className="font-medium text-ink">{newsletter.subject}</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-mist p-3 text-xs text-ink">{newsletter.body}</pre>
                <button
                  className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                  onClick={() => navigator.clipboard?.writeText(`${newsletter.subject}\n\n${newsletter.body}`)}
                  type="button"
                >
                  <Clipboard size={16} aria-hidden />
                  Copiar
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Nenhuma newsletter gerada nesta sessao.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <h2 className="mb-4 font-semibold text-ink">Fila multicanal</h2>
            <div className="space-y-3">
              {dashboard.schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-md border border-[var(--border)] px-3 py-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge value={schedule.status} />
                        <span className="text-sm text-[var(--muted)]">{schedule.channel}</span>
                        <span className="text-sm text-[var(--muted)]">
                          {schedule.scheduledAt ? new Date(schedule.scheduledAt).toLocaleString("pt-BR") : "Sem data"}
                        </span>
                      </div>
                      <h3 className="line-clamp-2 font-semibold text-ink">
                        {schedule.offer?.product.title || schedule.product?.title || "Publicacao"}
                      </h3>
                      <p className="text-xs text-[var(--muted)]">
                        Tentativas: {schedule.attempts}
                        {schedule.creativeAsset ? ` - criativo ${schedule.creativeAsset.status}` : ""}
                      </p>
                      {schedule.errorMessage ? <p className="mt-1 text-sm text-coral">{schedule.errorMessage}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => publishNow(schedule.id)}
                        title="Publicar agora"
                        type="button"
                      >
                        <Play size={16} aria-hidden />
                      </button>
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => cancelSchedule(schedule.id)}
                        title="Cancelar"
                        type="button"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!dashboard.schedules.length ? <p className="text-sm text-[var(--muted)]">Nenhuma publicacao V3 agendada.</p> : null}
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-4 font-semibold text-ink">Criativos</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {dashboard.creatives.map((asset) => (
                <div key={asset.id} className="rounded-md border border-[var(--border)] p-3">
                  <div className="mb-3 flex gap-3">
                    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-mist">
                      {asset.fileUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.fileUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon size={22} className="text-[var(--muted)]" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <StatusBadge value={asset.status} />
                        <span className="text-xs text-[var(--muted)]">{asset.channel || asset.type}</span>
                      </div>
                      <h3 className="line-clamp-2 text-sm font-semibold text-ink">{asset.product?.title ?? asset.type}</h3>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-xs text-[var(--muted)]">{asset.prompt}</p>
                  <button
                    className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                    onClick={() => approveCreative(asset.id)}
                    type="button"
                  >
                    <Rocket size={16} aria-hidden />
                    Aprovar
                  </button>
                </div>
              ))}
              {!dashboard.creatives.length ? <p className="text-sm text-[var(--muted)]">Nenhum criativo gerado.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
