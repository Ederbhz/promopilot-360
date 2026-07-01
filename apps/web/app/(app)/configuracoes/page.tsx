"use client";

import { FormEvent, useEffect, useState } from "react";
import { PlugZap, Save, ShieldCheck } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson } from "@/lib/api";

interface Marketplace {
  id: string;
  key: string;
  name: string;
  integrationType: string;
  isActive: boolean;
  health?: { ok: boolean; mode: string; message?: string };
  _count?: { offers: number; affiliateAccounts: number };
}

interface AffiliateAccount {
  id: string;
  name: string;
  accountIdentifier?: string | null;
  affiliateTag?: string | null;
  isActive: boolean;
  marketplace: { id: string; name: string; key: string };
}

export default function ConfiguracoesPage() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [accounts, setAccounts] = useState<AffiliateAccount[]>([]);
  const [form, setForm] = useState({
    marketplaceId: "",
    name: "",
    accountIdentifier: "",
    affiliateTag: "",
    credentials: "{}",
    config: "{}"
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [marketplaceData, accountData] = await Promise.all([
      apiFetch<Marketplace[]>("/marketplaces"),
      apiFetch<AffiliateAccount[]>("/affiliate-accounts")
    ]);
    setMarketplaces(marketplaceData);
    setAccounts(accountData);
    const firstMarketplace = marketplaceData[0];
    if (!form.marketplaceId && firstMarketplace) {
      setForm((current) => ({ ...current, marketplaceId: firstMarketplace.id }));
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar configuracoes."));
  }, []);

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await postJson("/affiliate-accounts", {
        marketplaceId: form.marketplaceId,
        name: form.name,
        accountIdentifier: form.accountIdentifier || undefined,
        affiliateTag: form.affiliateTag || undefined,
        credentials: parseJson(form.credentials),
        config: parseJson(form.config)
      });
      setForm({ ...form, name: "", accountIdentifier: "", affiliateTag: "", credentials: "{}", config: "{}" });
      await load();
      setMessage("Conta salva com credenciais criptografadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar conta.");
    }
  }

  async function testAccount(id: string) {
    const result = await postJson<{ message?: string; ok: boolean }>(`/affiliate-accounts/${id}/test`, {});
    setMessage(result.message || (result.ok ? "Conexao ativa." : "Conexao em modo assistido."));
  }

  return (
    <>
      <PageHeader title="Configuracoes de afiliado" eyebrow="Credenciais" />
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-3">
          {marketplaces.map((marketplace) => (
            <Panel key={marketplace.id} className="p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={marketplace.isActive ? "ACTIVE" : "PAUSED"} />
                    <span className="text-sm text-[var(--muted)]">{marketplace.integrationType}</span>
                    <span className="text-sm text-[var(--muted)]">{marketplace.health?.mode}</span>
                  </div>
                  <h2 className="font-semibold text-ink">{marketplace.name}</h2>
                  <p className="text-sm text-[var(--muted)]">{marketplace.health?.message}</p>
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {marketplace._count?.offers ?? 0} ofertas - {marketplace._count?.affiliateAccounts ?? 0} contas
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <Panel>
          <form onSubmit={createAccount} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Marketplace</span>
              <select
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.marketplaceId}
                onChange={(event) => setForm({ ...form, marketplaceId: event.target.value })}
              >
                {marketplaces.map((marketplace) => (
                  <option key={marketplace.id} value={marketplace.id}>
                    {marketplace.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nome da conta</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Identificador</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={form.accountIdentifier}
                  onChange={(event) => setForm({ ...form, accountIdentifier: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Tag afiliada</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={form.affiliateTag}
                  onChange={(event) => setForm({ ...form, affiliateTag: event.target.value })}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck size={15} aria-hidden />
                Credenciais JSON
              </span>
              <textarea
                className="focus-ring min-h-[96px] w-full rounded-md border border-[var(--border)] px-3 py-2 font-mono text-sm"
                value={form.credentials}
                onChange={(event) => setForm({ ...form, credentials: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Config JSON</span>
              <textarea
                className="focus-ring min-h-[80px] w-full rounded-md border border-[var(--border)] px-3 py-2 font-mono text-sm"
                value={form.config}
                onChange={(event) => setForm({ ...form, config: event.target.value })}
              />
            </label>
            <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90">
              <Save size={17} aria-hidden />
              Salvar conta
            </button>
          </form>

          <div className="mt-5 space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{account.name}</p>
                  <p className="text-xs text-[var(--muted)]">{account.marketplace.name}</p>
                </div>
                <button
                  className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                  onClick={() => testAccount(account.id)}
                  title="Testar conexao"
                >
                  <PlugZap size={16} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          {error ? <div className="mt-3"><ErrorLine message={error} /></div> : null}
          {message ? <p className="mt-3 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
        </Panel>
      </div>
    </>
  );
}

function parseJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") return undefined;
  return JSON.parse(trimmed) as Record<string, unknown>;
}
