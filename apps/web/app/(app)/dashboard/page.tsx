"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, MousePointerClick, Send, ShoppingBag, Target } from "lucide-react";
import { LoadingLine, ErrorLine } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch } from "@/lib/api";

interface DashboardData {
  cards: {
    offersToday: number;
    scheduledPosts: number;
    publishedPosts: number;
    clicks: number;
    activeCampaigns: number;
    integrationErrors: number;
  };
  charts: {
    marketplaces: Array<{ id: string; name: string; offers: number; campaigns: number }>;
  };
  topOffers: Array<{
    id: string;
    status: string;
    score: string | number | null;
    product: { title: string; imageUrl?: string | null };
    marketplace: { name: string };
    _count: { clickEvents: number; scheduledPosts: number };
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<DashboardData>("/reports/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar dashboard."));
  }, []);

  if (error) return <ErrorLine message={error} />;
  if (!data) return <LoadingLine />;

  const maxOffers = Math.max(1, ...data.charts.marketplaces.map((item) => item.offers));

  return (
    <>
      <PageHeader title="Dashboard" eyebrow="Operacao" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Ofertas hoje" value={data.cards.offersToday} icon={ShoppingBag} tone="leaf" />
        <MetricCard label="Programadas" value={data.cards.scheduledPosts} icon={CalendarClock} tone="saffron" />
        <MetricCard label="Publicadas" value={data.cards.publishedPosts} icon={Send} tone="ink" />
        <MetricCard label="Cliques totais" value={data.cards.clicks} icon={MousePointerClick} tone="leaf" />
        <MetricCard label="Campanhas ativas" value={data.cards.activeCampaigns} icon={Target} tone="saffron" />
        <MetricCard label="Alertas" value={data.cards.integrationErrors} icon={AlertTriangle} tone="coral" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-ink">Marketplaces</h2>
          <div className="space-y-3">
            {data.charts.marketplaces.map((item) => (
              <div key={item.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-[var(--muted)]">{item.offers} ofertas</span>
                </div>
                <div className="h-2 rounded-md bg-mist">
                  <div
                    className="h-2 rounded-md bg-leaf"
                    style={{ width: `${Math.max(8, (item.offers / maxOffers) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-4 text-base font-semibold text-ink">Top ofertas</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3">Marketplace</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Cliques</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.topOffers.map((offer) => (
                  <tr key={offer.id}>
                    <td className="max-w-[280px] py-3 pr-3 font-medium">{offer.product.title}</td>
                    <td className="py-3 pr-3">{offer.marketplace.name}</td>
                    <td className="py-3 pr-3">{Number(offer.score ?? 0).toFixed(0)}</td>
                    <td className="py-3 pr-3">
                      <StatusBadge value={offer.status} />
                    </td>
                    <td className="py-3 pr-3">{offer._count.clickEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
