"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, ExternalLink, KeyRound, PlugZap, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson, putJson } from "@/lib/api";

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

interface MercadoLivreTokenResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  userId?: string;
}

type QuickFieldTarget = "credentials" | "config" | "accountIdentifier" | "affiliateTag" | "oauth";

interface QuickField {
  key: string;
  label: string;
  placeholder?: string;
  target: QuickFieldTarget;
  secret?: boolean;
  multiline?: boolean;
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
    { key: "apiBaseUrl", label: "URL da API", placeholder: "Opcional", target: "config" },
    { key: "subIds", label: "SubIds", placeholder: "instagram,stories,promo", target: "config" }
  ],
  MERCADO_LIVRE: [
    { key: "clientId", label: "App ID", target: "accountIdentifier" },
    { key: "clientSecret", label: "Client Secret", target: "credentials", secret: true },
    { key: "redirectUri", label: "Redirect URI", target: "config" },
    { key: "authorizationCode", label: "Codigo de autorizacao", target: "oauth" },
    { key: "codeVerifier", label: "Code Verifier", placeholder: "Opcional", target: "oauth", secret: true },
    { key: "accessToken", label: "Access Token", target: "credentials", secret: true },
    { key: "refreshToken", label: "Refresh Token", target: "credentials", secret: true },
    { key: "affiliateCookie", label: "Cookie do Portal", target: "credentials", secret: true, multiline: true },
    { key: "csrfToken", label: "X-CSRF-Token", target: "credentials", secret: true },
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
  const [editingAccountId, setEditingAccountId] = useState("");
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

  async function saveAccount(event: FormEvent) {
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
      const body = {
        marketplaceId: form.marketplaceId,
        name: payload.name,
        accountIdentifier: payload.accountIdentifier,
        affiliateTag: payload.affiliateTag,
        credentials: payload.credentials,
        config: payload.config
      };
      if (editingAccountId) {
        await putJson(`/affiliate-accounts/${editingAccountId}`, body);
      } else {
        await postJson("/affiliate-accounts", body);
      }
      resetForm(selectedMarketplace);
      await load();
      setMessage(editingAccountId ? "Conta atualizada." : "Conta salva com credenciais criptografadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar conta.");
    }
  }

  function editAccount(account: AffiliateAccount) {
    setEditingAccountId(account.id);
    setError("");
    setMessage("");
    setQuickFields(getInitialQuickFields(account.marketplace.key));
    setForm({
      marketplaceId: account.marketplace.id,
      name: account.name,
      accountIdentifier: account.accountIdentifier ?? "",
      affiliateTag: account.affiliateTag ?? "",
      credentials: "{}",
      config: "{}"
    });
  }

  function resetForm(marketplace = selectedMarketplace) {
    setEditingAccountId("");
    setForm({
      marketplaceId: marketplace?.id ?? form.marketplaceId,
      name: marketplace ? `Programa ${marketplace.name}` : "",
      accountIdentifier: "",
      affiliateTag: "",
      credentials: "{}",
      config: "{}"
    });
    setQuickFields({});
  }

  async function testAccount(id: string) {
    const result = await postJson<{ message?: string; ok: boolean }>(`/affiliate-accounts/${id}/test`, {});
    setMessage(result.message || (result.ok ? "Conexao ativa." : "Conexao em modo assistido."));
  }

  async function openMercadoLivreAuthorization() {
    setError("");
    setMessage("");
    const clientId = quickFields.clientId?.trim();
    const redirectUri = quickFields.redirectUri?.trim();
    if (!clientId || !redirectUri) {
      setError("Informe App ID e Redirect URI do Mercado Livre.");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const result = await postJson<{ url: string }>("/affiliate-accounts/mercado-livre/oauth-url", {
        clientId,
        redirectUri
      });
      if (popup) {
        popup.location.href = result.url;
      } else {
        window.location.href = result.url;
      }
      setMessage("Autorizacao do Mercado Livre aberta. Depois cole aqui o codigo recebido.");
    } catch (err) {
      popup?.close();
      setError(err instanceof Error ? err.message : "Falha ao abrir autorizacao do Mercado Livre.");
    }
  }

  async function exchangeMercadoLivreCode() {
    setError("");
    setMessage("");
    const clientId = quickFields.clientId?.trim();
    const clientSecret = quickFields.clientSecret?.trim();
    const redirectUri = quickFields.redirectUri?.trim();
    const code = quickFields.authorizationCode?.trim();
    if (!clientId || !clientSecret || !redirectUri || !code) {
      setError("Informe App ID, Client Secret, Redirect URI e Codigo de autorizacao.");
      return;
    }

    try {
      const result = await postJson<MercadoLivreTokenResponse>("/affiliate-accounts/mercado-livre/exchange-token", {
        clientId,
        clientSecret,
        redirectUri,
        code,
        codeVerifier: quickFields.codeVerifier?.trim() || undefined
      });
      if (!result.accessToken) throw new Error("Mercado Livre nao retornou Access Token.");
      setQuickFields((current) => ({
        ...current,
        accessToken: result.accessToken ?? current.accessToken ?? "",
        refreshToken: result.refreshToken ?? current.refreshToken ?? ""
      }));
      setMessage(
        result.expiresIn
          ? `Token Mercado Livre recebido. Expira em ${Math.round(result.expiresIn / 60)} minutos. Salve a conta.`
          : "Token Mercado Livre recebido. Salve a conta."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao trocar codigo do Mercado Livre.");
    }
  }

  async function refreshMercadoLivreToken() {
    setError("");
    setMessage("");
    const clientId = quickFields.clientId?.trim();
    const clientSecret = quickFields.clientSecret?.trim();
    const refreshToken = quickFields.refreshToken?.trim();
    if (!clientId || !clientSecret || !refreshToken) {
      setError("Informe App ID, Client Secret e Refresh Token.");
      return;
    }

    try {
      const result = await postJson<MercadoLivreTokenResponse>("/affiliate-accounts/mercado-livre/refresh-token", {
        clientId,
        clientSecret,
        refreshToken
      });
      if (!result.accessToken) throw new Error("Mercado Livre nao retornou Access Token.");
      setQuickFields((current) => ({
        ...current,
        accessToken: result.accessToken ?? current.accessToken ?? "",
        refreshToken: result.refreshToken ?? current.refreshToken ?? ""
      }));
      setMessage("Token Mercado Livre atualizado. Salve a conta.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar token do Mercado Livre.");
    }
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
          <form onSubmit={saveAccount} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Marketplace</span>
              <select
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.marketplaceId}
                onChange={(event) => {
                  const marketplace = marketplaces.find((item) => item.id === event.target.value);
                  setQuickFields(getInitialQuickFields(marketplace?.key));
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
                    {field.multiline ? (
                      <textarea
                        className="focus-ring min-h-[92px] w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                        value={quickFields[field.key] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(event) => setQuickFields({ ...quickFields, [field.key]: event.target.value })}
                      />
                    ) : (
                      <input
                        className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                        type={field.secret ? "password" : "text"}
                        value={quickFields[field.key] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(event) => setQuickFields({ ...quickFields, [field.key]: event.target.value })}
                      />
                    )}
                  </label>
                ))}
              </div>
            ) : null}
            {selectedMarketplace?.key === "MERCADO_LIVRE" ? (
              <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                <button
                  className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                  onClick={openMercadoLivreAuthorization}
                  type="button"
                >
                  <ExternalLink size={16} aria-hidden />
                  Abrir autorizacao
                </button>
                <button
                  className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                  onClick={exchangeMercadoLivreCode}
                  type="button"
                >
                  <KeyRound size={16} aria-hidden />
                  Trocar codigo
                </button>
                <button
                  className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                  onClick={refreshMercadoLivreToken}
                  type="button"
                >
                  <RefreshCw size={16} aria-hidden />
                  Atualizar token
                </button>
              </div>
            ) : null}
            {selectedMarketplace?.key === "SHOPEE" ? (
              <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                <button
                  className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                  onClick={() =>
                    window.open("https://affiliate.shopee.com.br/open_api/home", "_blank", "noopener,noreferrer")
                  }
                  type="button"
                >
                  <ExternalLink size={16} aria-hidden />
                  Abrir Open API Shopee
                </button>
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
              {editingAccountId ? "Salvar alterações" : "Salvar conta"}
            </button>
            {editingAccountId ? (
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-semibold hover:bg-mist"
                onClick={() => resetForm()}
                type="button"
              >
                <X size={17} aria-hidden />
                Cancelar edição
              </button>
            ) : null}
          </form>

          <div className="mt-5 space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{account.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {account.marketplace.name}
                    {account.affiliateTag ? ` - Tag: ${account.affiliateTag}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => editAccount(account)}
                    title="Editar conta"
                  >
                    <Edit3 size={16} aria-hidden />
                  </button>
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => testAccount(account.id)}
                    title="Testar conexao"
                  >
                    <PlugZap size={16} aria-hidden />
                  </button>
                </div>
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

function getDefaultRedirectUri() {
  if (typeof window === "undefined") return "";
  return window.location.href.split(/[?#]/)[0] ?? "";
}

function getInitialQuickFields(marketplaceKey?: string): Record<string, string> {
  if (marketplaceKey === "MERCADO_LIVRE") return { redirectUri: getDefaultRedirectUri() };
  if (marketplaceKey === "SHOPEE") return { apiBaseUrl: "https://open-api.affiliate.shopee.com.br/graphql" };
  return {};
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
