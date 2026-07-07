"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, Plus, RefreshCw, Save, TicketPercent, Trash2, X } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, deleteJson, postJson, putJson } from "@/lib/api";

interface Marketplace {
  id: string;
  name: string;
}

interface Coupon {
  id: string;
  codigo: string;
  titulo?: string | null;
  descricao?: string | null;
  percentualDesconto?: string | number | null;
  valorDesconto?: string | number | null;
  valorMinimo?: string | number | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  status: boolean;
  origem?: string | null;
  urlOrigem?: string | null;
  marketplace: { name: string };
  products?: Array<{ product: { title: string } }>;
  categories?: Array<{ category: { name: string } }>;
}

const emptyForm = {
  marketplaceId: "",
  codigo: "",
  titulo: "",
  descricao: "",
  percentualDesconto: "",
  valorDesconto: "",
  valorMinimo: "",
  dataInicio: "",
  dataFim: "",
  status: true,
  origem: "",
  urlOrigem: ""
};

export default function CuponsPage() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [marketplaceData, couponData] = await Promise.all([
      apiFetch<Marketplace[]>("/marketplaces"),
      apiFetch<Coupon[]>("/coupons")
    ]);
    setMarketplaces(marketplaceData);
    setCoupons(couponData);
    setForm((current) => ({ ...current, marketplaceId: current.marketplaceId || marketplaceData[0]?.id || "" }));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar cupons."));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const body = {
        marketplaceId: form.marketplaceId,
        codigo: form.codigo,
        titulo: form.titulo || undefined,
        descricao: form.descricao || undefined,
        percentualDesconto: numberOrUndefined(form.percentualDesconto),
        valorDesconto: numberOrUndefined(form.valorDesconto),
        valorMinimo: numberOrUndefined(form.valorMinimo),
        dataInicio: form.dataInicio || undefined,
        dataFim: form.dataFim || undefined,
        status: form.status,
        origem: form.origem || undefined,
        urlOrigem: form.urlOrigem || undefined
      };
      if (editingId) await putJson(`/coupons/${editingId}`, body);
      else await postJson("/coupons", body);
      setEditingId("");
      setForm({ ...emptyForm, marketplaceId: marketplaces[0]?.id || "" });
      await load();
      setMessage(editingId ? "Cupom atualizado." : "Cupom criado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar cupom.");
    }
  }

  async function remove(id: string) {
    setError("");
    setMessage("");
    try {
      await deleteJson(`/coupons/${id}`);
      await load();
      setMessage("Cupom arquivado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao arquivar cupom.");
    }
  }

  function edit(coupon: Coupon) {
    setEditingId(coupon.id);
    const marketplace = marketplaces.find((item) => item.name === coupon.marketplace.name);
    setForm({
      marketplaceId: marketplace?.id || "",
      codigo: coupon.codigo,
      titulo: coupon.titulo ?? "",
      descricao: coupon.descricao ?? "",
      percentualDesconto: coupon.percentualDesconto?.toString() ?? "",
      valorDesconto: coupon.valorDesconto?.toString() ?? "",
      valorMinimo: coupon.valorMinimo?.toString() ?? "",
      dataInicio: toDateInput(coupon.dataInicio),
      dataFim: toDateInput(coupon.dataFim),
      status: coupon.status,
      origem: coupon.origem ?? "",
      urlOrigem: coupon.urlOrigem ?? ""
    });
  }

  if (error && !coupons) return <ErrorLine message={error} />;
  if (!coupons) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Cupons"
        eyebrow="Banco V2"
        actions={
          <button
            className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
            onClick={() => load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao atualizar."))}
            type="button"
          >
            <RefreshCw size={16} aria-hidden />
            Atualizar
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel>
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Marketplace</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={form.marketplaceId}
                  onChange={(event) => setForm({ ...form, marketplaceId: event.target.value })}
                  required
                >
                  {marketplaces.map((marketplace) => (
                    <option key={marketplace.id} value={marketplace.id}>
                      {marketplace.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Codigo</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={form.codigo}
                  onChange={(event) => setForm({ ...form, codigo: event.target.value.toUpperCase() })}
                  required
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Titulo</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.titulo}
                onChange={(event) => setForm({ ...form, titulo: event.target.value })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">% desconto</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="number"
                  value={form.percentualDesconto}
                  onChange={(event) => setForm({ ...form, percentualDesconto: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Valor</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="number"
                  value={form.valorDesconto}
                  onChange={(event) => setForm({ ...form, valorDesconto: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Minimo</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="number"
                  value={form.valorMinimo}
                  onChange={(event) => setForm({ ...form, valorMinimo: event.target.value })}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Inicio</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="date"
                  value={form.dataInicio}
                  onChange={(event) => setForm({ ...form, dataInicio: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Fim</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="date"
                  value={form.dataFim}
                  onChange={(event) => setForm({ ...form, dataFim: event.target.value })}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Descricao</span>
              <textarea
                className="focus-ring min-h-24 w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.descricao}
                onChange={(event) => setForm({ ...form, descricao: event.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.status} onChange={(event) => setForm({ ...form, status: event.target.checked })} />
              Cupom ativo
            </label>
            <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90">
              {editingId ? <Save size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
              {editingId ? "Salvar cupom" : "Criar cupom"}
            </button>
            {editingId ? (
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-semibold hover:bg-mist"
                onClick={() => {
                  setEditingId("");
                  setForm({ ...emptyForm, marketplaceId: marketplaces[0]?.id || "" });
                }}
                type="button"
              >
                <X size={17} aria-hidden />
                Cancelar
              </button>
            ) : null}
          </form>
        </Panel>

        <div className="space-y-3">
          {error ? <ErrorLine message={error} /> : null}
          {message ? <p className="rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
          {coupons.map((coupon) => (
            <Panel key={coupon.id} className="p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={coupon.status ? "ATIVO" : "INATIVO"} />
                    <span className="text-sm text-[var(--muted)]">{coupon.marketplace.name}</span>
                  </div>
                  <h2 className="flex items-center gap-2 font-semibold text-ink">
                    <TicketPercent size={17} aria-hidden />
                    {coupon.codigo}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">{coupon.titulo || coupon.descricao || "Cupom sem descricao"}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {coupon.percentualDesconto ? `${coupon.percentualDesconto}%` : coupon.valorDesconto ? formatMoney(coupon.valorDesconto) : "Valor aberto"}
                    {coupon.valorMinimo ? ` - minimo ${formatMoney(coupon.valorMinimo)}` : ""}
                    {coupon.dataFim ? ` - ate ${new Date(coupon.dataFim).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => edit(coupon)} title="Editar">
                    <Edit3 size={16} aria-hidden />
                  </button>
                  <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => remove(coupon.id)} title="Arquivar">
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
          {!coupons.length ? <p className="text-sm text-[var(--muted)]">Nenhum cupom cadastrado.</p> : null}
        </div>
      </div>
    </>
  );
}

function numberOrUndefined(value: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}
