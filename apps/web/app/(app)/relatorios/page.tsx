"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch } from "@/lib/api";

interface OfferRow {
  id: string;
  status: string;
  score?: string | number | null;
  currentPrice?: string | number | null;
  product: { title: string };
  marketplace: { name: string };
  _count: { scheduledPosts: number; clickEvents: number };
}

interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  status: string;
  marketplace?: { name: string } | null;
  _count: { scheduledPosts: number };
}

interface ClickRow {
  id: string;
  clickedAt: string;
  referer?: string | null;
  offer?: { product: { title: string }; marketplace: { name: string } } | null;
}

interface ErrorRow {
  id: string;
  operation: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  marketplace?: { name: string } | null;
}

type Tab = "offers" | "campaigns" | "clicks" | "errors";

export default function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>("offers");
  const [offers, setOffers] = useState<OfferRow[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [clicks, setClicks] = useState<ClickRow[] | null>(null);
  const [errors, setErrors] = useState<ErrorRow[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [offerData, campaignData, clickData, errorData] = await Promise.all([
      apiFetch<OfferRow[]>("/reports/offers"),
      apiFetch<CampaignRow[]>("/reports/campaigns"),
      apiFetch<ClickRow[]>("/reports/clicks"),
      apiFetch<ErrorRow[]>("/reports/errors")
    ]);
    setOffers(offerData);
    setCampaigns(campaignData);
    setClicks(clickData);
    setErrors(errorData);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar relatorios."));
  }, []);

  const loaded = offers && campaigns && clicks && errors;

  return (
    <>
      <PageHeader
        title="Relatorios"
        eyebrow="Desempenho"
        actions={
          <>
            <button
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
              onClick={() => load()}
            >
              <RefreshCw size={16} aria-hidden />
              Atualizar
            </button>
            <button
              className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
              onClick={() => exportCsv(tab, { offers, campaigns, clicks, errors })}
            >
              <Download size={16} aria-hidden />
              CSV
            </button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["offers", "campaigns", "clicks", "errors"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`focus-ring rounded-md px-3 py-2 text-sm font-medium ${
              tab === item ? "bg-leaf text-white" : "border border-[var(--border)] bg-white hover:bg-mist"
            }`}
            onClick={() => setTab(item)}
          >
            {labels[item]}
          </button>
        ))}
      </div>

      {error ? <ErrorLine message={error} /> : null}
      {!loaded && !error ? <LoadingLine /> : null}
      {loaded ? (
        <Panel>
          {tab === "offers" ? <OffersTable rows={offers} /> : null}
          {tab === "campaigns" ? <CampaignsTable rows={campaigns} /> : null}
          {tab === "clicks" ? <ClicksTable rows={clicks} /> : null}
          {tab === "errors" ? <ErrorsTable rows={errors} /> : null}
        </Panel>
      ) : null}
    </>
  );
}

const labels: Record<Tab, string> = {
  offers: "Ofertas",
  campaigns: "Campanhas",
  clicks: "Cliques",
  errors: "Erros"
};

function OffersTable({ rows }: { rows: OfferRow[] }) {
  return (
    <Table>
      <thead className="text-xs uppercase text-[var(--muted)]">
        <tr><th>Produto</th><th>Marketplace</th><th>Score</th><th>Status</th><th>Posts</th><th>Cliques</th></tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.product.title}</td><td>{row.marketplace.name}</td><td>{Number(row.score ?? 0).toFixed(0)}</td>
            <td><StatusBadge value={row.status} /></td><td>{row._count.scheduledPosts}</td><td>{row._count.clickEvents}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function CampaignsTable({ rows }: { rows: CampaignRow[] }) {
  return (
    <Table>
      <thead className="text-xs uppercase text-[var(--muted)]">
        <tr><th>Campanha</th><th>Marketplace</th><th>Canal</th><th>Status</th><th>Posts</th></tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td><td>{row.marketplace?.name ?? "Todos"}</td><td>{row.channel}</td>
            <td><StatusBadge value={row.status} /></td><td>{row._count.scheduledPosts}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ClicksTable({ rows }: { rows: ClickRow[] }) {
  return (
    <Table>
      <thead className="text-xs uppercase text-[var(--muted)]">
        <tr><th>Data</th><th>Produto</th><th>Marketplace</th><th>Origem</th></tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{new Date(row.clickedAt).toLocaleString("pt-BR")}</td>
            <td>{row.offer?.product.title ?? "-"}</td><td>{row.offer?.marketplace.name ?? "-"}</td><td>{row.referer ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ErrorsTable({ rows }: { rows: ErrorRow[] }) {
  return (
    <Table>
      <thead className="text-xs uppercase text-[var(--muted)]">
        <tr><th>Data</th><th>Marketplace</th><th>Operacao</th><th>Status</th><th>Erro</th></tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{new Date(row.createdAt).toLocaleString("pt-BR")}</td><td>{row.marketplace?.name ?? "-"}</td>
            <td>{row.operation}</td><td><StatusBadge value={row.status} /></td><td>{row.errorMessage ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-y-0 text-left text-sm [&_td]:py-3 [&_td]:pr-4 [&_th]:py-2 [&_th]:pr-4">
        {children}
      </table>
    </div>
  );
}

function exportCsv(tab: Tab, data: Record<string, unknown>) {
  const rows = data[tab] as Array<Record<string, unknown>> | null;
  if (!rows?.length) return;
  const csv = rows.map((row) => JSON.stringify(row)).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `promopilot-${tab}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
