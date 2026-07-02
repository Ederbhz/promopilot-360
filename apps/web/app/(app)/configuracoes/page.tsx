"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type QuickFieldTarget = "credentials" | "config" | "accountIdentifier" | "affiliateTag";

interface QuickField {
  key: string;
  label: string;
  placeholder?: string;
  target: QuickFieldTarget;
  secret?: boolean;
}

const programFields: Record<string, QuickField[]> = {
  AWIN: [
    { key: "apiToken", label: "Token da API", target: "credentials", secret: true },
    { key: "publisherId", label: "Publisher ID", target: "affiliateTag" },
    { key: "advertiserId", label: "Advertiser ID", placeholder: "Natura/Avon", target: "config" }
  ],
  SHOPEE: [
    { key: "appId", label: "App ID", target: "accountIdentifier" },
    { key: "appSecret", label: "App Secret", target: "credentials", secret: true },
    { key: "affiliateId", label: "Affiliate ID", target: "affiliateTag" },
    { key: "apiBaseUrl", label: "URL da API", placeholder: "Opcional", target: "config" }
  ],
  MERCADO_LIVRE: [
    { key: "accessToken", label: "Access Token", target: "credentials", secret: true },
    { key: "affiliateTag", label: "Tag de afiliado", placeholder: "matt_tool", target: "affiliateTag" }
  ],
  MAGALU: [
    { key: "storeUrl", label: "URL da loja/divulgador", target: "accountIdentifier" },
    { key: "partnerId", label: "Partner ID", placeholder: "Opcional", target: "config" }
  ],
  MANUAL: [
    { key: "defaultTag", label: "Identificador padrao", placeholder: "Opcional", target: "affiliateTag" }
  ]
};

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
  const [quickFields, setQuickFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedMarketplace = useMemo(
    () => marketplaces.find((marketplace) => marketplace.id === form.marketplaceId),
    [form.marketplaceId, marketplaces]
  );
  const selectedProgramFields = selectedMarketplace ? programFields[selectedMarketplace.key] ?? [] : [];

  async function load() {
    const [marketplaceData, accountData] = await Promise.all([
      apiFetch<Marketplace[]>("/marketplaces"),
      apiFetch<AffiliateAccount[]>("/affiliate-accounts")
    ]);
    setMarketplaces(marketplaceData);
    setAccounts(accountData);
    const firstMarketplace = marketplaceData[0];
    if (!form.marketplaceId && firstMarketplace) {
      setForm((current) => ({
        ...current,
        marketplaceId: firstMarketplace.id,
        name: current.name || `Programa ${firstMarketplace.name}`
      }));
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
      const payload = buildProgramPayload({
        form,
        quickFields,
        selectedMarketplace,
        selectedProgramFields
      });
      await postJson("/affiliate-accounts", {
        marketplaceId: form.marketplaceId,
        name: payload.name,
        accountIdentifier: payload.accountIdentifier,
        affiliateTag: payload.affiliateTag,
        credentials: payload.credentials,
        config: payload.config
      });
      setForm({
        ...form,
        name: selectedMarketplace ? `Programa ${selectedMarketplace.name}` : "",
        accountIdentifier: "",
        affiliateTag: "",
        credentials: "{}",
        config: "{}"
      });
      setQuickFields({});
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
                onChange={(event) => {
                  const marketplace = marketplaces.find((item) => item.id === event.target.value);
                  setQuickFields({});
                  setForm({
                    ...form,
                    marketplaceId: event.target.value,
                    name: marketplace ? `Programa ${marketplace.name}` : form.name
                  });
                }}
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
            {selectedProgramFields.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedProgramFields.map((field) => (
                  <label className="block" key={field.key}>
                    <span className="mb-1 block text-sm font-medium">{field.label}</span>
                    <input
                      className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                      type={field.secret ? "password" : "text"}
                      value={quickFields[field.key] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) => setQuickFields({ ...quickFields, [field.key]: event.target.value })}
                    />
                  </label>
                ))}
              </div>
            ) : null}
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

function buildProgramPayload(input: {
  form: {
    marketplaceId: string;
    name: string;
    accountIdentifier: string;
    affiliateTag: string;
    credentials: string;
    config: string;
  };
  quickFields: Record<string, string>;
  selectedMarketplace?: Marketplace;
  selectedProgramFields: QuickField[];
}) {
  const credentials = parseJson(input.form.credentials) ?? {};
  const config = parseJson(input.form.config) ?? {};
  let accountIdentifier = input.form.accountIdentifier || undefined;
  let affiliateTag = input.form.affiliateTag || undefined;

  for (const field of input.selectedProgramFields) {
    const value = input.quickFields[field.key]?.trim();
    if (!value) continue;
    if (field.target === "credentials") credentials[field.key] = value;
    if (field.target === "config") config[field.key] = value;
    if (field.target === "accountIdentifier") accountIdentifier = value;
    if (field.target === "affiliateTag") affiliateTag = value;
  }

  return {
    name: input.form.name || (input.selectedMarketplace ? `Programa ${input.selectedMarketplace.name}` : "Programa de afiliado"),
    accountIdentifier,
    affiliateTag,
    credentials: Object.keys(credentials).length ? credentials : undefined,
    config: Object.keys(config).length ? config : undefined
  };
}
