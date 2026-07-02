"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, PlugZap, Plus, Save, Trash2, X } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson, putJson } from "@/lib/api";

interface WhatsAppConnection {
  id: string;
  name: string;
  phoneNumber?: string | null;
  provider: string;
  status: string;
  phoneNumberId?: string | null;
  config?: Record<string, unknown> | null;
  isActive: boolean;
  _count?: { groups: number };
}

interface WhatsAppGroup {
  id: string;
  connectionId: string;
  name: string;
  externalId: string;
  type: string;
  isActive: boolean;
  connection?: { name: string; provider: string };
}

const emptyConnectionForm = {
  name: "",
  phoneNumber: "",
  provider: "CLOUD_API",
  phoneNumberId: "",
  token: "",
  apiBaseUrl: "",
  webhookUrl: "",
  messageType: "TEXT_IMAGE",
  previewFormat: "PORTRAIT",
  removePreviewTitle: false,
  optimizeImage: false,
  resizeImage: true
};

const emptyGroupForm = {
  connectionId: "",
  name: "",
  externalId: "",
  isActive: true
};

export default function WhatsAppPage() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [connectionForm, setConnectionForm] = useState(emptyConnectionForm);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [editingConnectionId, setEditingConnectionId] = useState("");
  const [editingGroupId, setEditingGroupId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [connectionData, groupData] = await Promise.all([
      apiFetch<WhatsAppConnection[]>("/whatsapp/connections"),
      apiFetch<WhatsAppGroup[]>("/whatsapp/groups")
    ]);
    setConnections(connectionData);
    setGroups(groupData);
    if (!groupForm.connectionId && connectionData[0]) {
      setGroupForm((current) => ({ ...current, connectionId: connectionData[0]!.id }));
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar WhatsApp."));
  }, []);

  async function saveConnection(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const body = buildConnectionPayload(connectionForm);
      if (editingConnectionId) {
        await putJson(`/whatsapp/connections/${editingConnectionId}`, body);
      } else {
        await postJson("/whatsapp/connections", body);
      }
      setConnectionForm(emptyConnectionForm);
      setEditingConnectionId("");
      await load();
      setMessage(editingConnectionId ? "Conexao atualizada." : "Conexao salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar conexao.");
    }
  }

  async function saveGroup(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const body = {
        connectionId: groupForm.connectionId,
        name: groupForm.name,
        externalId: groupForm.externalId,
        type: "GROUP",
        isActive: groupForm.isActive
      };
      if (editingGroupId) {
        await putJson(`/whatsapp/groups/${editingGroupId}`, body);
      } else {
        await postJson("/whatsapp/groups", body);
      }
      setGroupForm({ ...emptyGroupForm, connectionId: connections[0]?.id ?? "" });
      setEditingGroupId("");
      await load();
      setMessage(editingGroupId ? "Grupo atualizado." : "Grupo cadastrado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar grupo.");
    }
  }

  async function testConnection(id: string) {
    const result = await postJson<{ message?: string; ok: boolean }>(`/whatsapp/connections/${id}/test`, {});
    await load();
    setMessage(result.message || (result.ok ? "Conexao ativa." : "Conexao pendente."));
  }

  async function deleteGroup(id: string) {
    await apiFetch(`/whatsapp/groups/${id}`, { method: "DELETE" });
    await load();
    setMessage("Grupo excluido.");
  }

  function editConnection(connection: WhatsAppConnection) {
    const config = connection.config ?? {};
    setEditingConnectionId(connection.id);
    setConnectionForm({
      name: connection.name,
      phoneNumber: connection.phoneNumber ?? "",
      provider: connection.provider,
      phoneNumberId: connection.phoneNumberId ?? "",
      token: "",
      apiBaseUrl: stringValue(config.apiBaseUrl),
      webhookUrl: stringValue(config.webhookUrl),
      messageType: stringValue(config.messageType) || "TEXT_IMAGE",
      previewFormat: stringValue(config.previewFormat) || "PORTRAIT",
      removePreviewTitle: config.removePreviewTitle === true,
      optimizeImage: config.optimizeImage === true,
      resizeImage: config.resizeImage !== false
    });
  }

  function editGroup(group: WhatsAppGroup) {
    setEditingGroupId(group.id);
    setGroupForm({
      connectionId: group.connectionId,
      name: group.name,
      externalId: group.externalId,
      isActive: group.isActive
    });
  }

  return (
    <>
      <PageHeader title="WhatsApp" eyebrow="Envios" />
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <Panel>
            <form onSubmit={saveConnection} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Nome</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.name}
                    onChange={(event) => setConnectionForm({ ...connectionForm, name: event.target.value })}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Numero</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.phoneNumber}
                    onChange={(event) => setConnectionForm({ ...connectionForm, phoneNumber: event.target.value })}
                    placeholder="5531999999999"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Provedor</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.provider}
                    onChange={(event) => setConnectionForm({ ...connectionForm, provider: event.target.value })}
                  >
                    <option value="CLOUD_API">WhatsApp Cloud API</option>
                    <option value="WASSENGER">Wassenger</option>
                    <option value="WEBHOOK">Webhook/API propria</option>
                    <option value="ASSISTED">Assistido</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Phone Number ID</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.phoneNumberId}
                    onChange={(event) => setConnectionForm({ ...connectionForm, phoneNumberId: event.target.value })}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Token</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  type="password"
                  value={connectionForm.token}
                  onChange={(event) => setConnectionForm({ ...connectionForm, token: event.target.value })}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">URL da API</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.apiBaseUrl}
                    onChange={(event) => setConnectionForm({ ...connectionForm, apiBaseUrl: event.target.value })}
                    placeholder="Opcional"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Webhook</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.webhookUrl}
                    onChange={(event) => setConnectionForm({ ...connectionForm, webhookUrl: event.target.value })}
                    placeholder="https://..."
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Tipo de mensagem</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.messageType}
                    onChange={(event) => setConnectionForm({ ...connectionForm, messageType: event.target.value })}
                  >
                    <option value="TEXT_IMAGE">Texto + imagem</option>
                    <option value="TEXT_ONLY">Texto</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Preview do link</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.previewFormat}
                    onChange={(event) => setConnectionForm({ ...connectionForm, previewFormat: event.target.value })}
                  >
                    <option value="PORTRAIT">Retrato</option>
                    <option value="LANDSCAPE">Paisagem</option>
                    <option value="NONE">Sem preview</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Toggle
                  checked={connectionForm.removePreviewTitle}
                  label="Remover titulo"
                  onChange={(checked) => setConnectionForm({ ...connectionForm, removePreviewTitle: checked })}
                />
                <Toggle
                  checked={connectionForm.optimizeImage}
                  label="Otimizar imagem"
                  onChange={(checked) => setConnectionForm({ ...connectionForm, optimizeImage: checked })}
                />
                <Toggle
                  checked={connectionForm.resizeImage}
                  label="Redimensionar"
                  onChange={(checked) => setConnectionForm({ ...connectionForm, resizeImage: checked })}
                />
              </div>
              <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90">
                <Save size={17} aria-hidden />
                {editingConnectionId ? "Salvar conexao" : "Cadastrar conexao"}
              </button>
              {editingConnectionId ? (
                <button
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-semibold hover:bg-mist"
                  onClick={() => {
                    setEditingConnectionId("");
                    setConnectionForm(emptyConnectionForm);
                  }}
                  type="button"
                >
                  <X size={17} aria-hidden />
                  Cancelar
                </button>
              ) : null}
            </form>
          </Panel>

          <Panel>
            <form onSubmit={saveGroup} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Conexao</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={groupForm.connectionId}
                  onChange={(event) => setGroupForm({ ...groupForm, connectionId: event.target.value })}
                  required
                >
                  <option value="">Selecione</option>
                  {connections.map((connection) => (
                    <option value={connection.id} key={connection.id}>
                      {connection.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Grupo</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={groupForm.name}
                    onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">ID do grupo</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={groupForm.externalId}
                    onChange={(event) => setGroupForm({ ...groupForm, externalId: event.target.value })}
                    placeholder="1203...@g.us"
                    required
                  />
                </label>
              </div>
              <Toggle
                checked={groupForm.isActive}
                label="Grupo ativo"
                onChange={(checked) => setGroupForm({ ...groupForm, isActive: checked })}
              />
              <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-amber px-3 py-2 font-semibold text-ink hover:bg-amber/90">
                <Plus size={17} aria-hidden />
                {editingGroupId ? "Salvar grupo" : "Cadastrar grupo"}
              </button>
            </form>
          </Panel>
        </div>

        <div className="space-y-4">
          {error ? <ErrorLine message={error} /> : null}
          {message ? <p className="rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
          <Panel>
            <h2 className="mb-3 font-semibold text-ink">Numeros conectados</h2>
            <div className="space-y-2">
              {connections.map((connection) => (
                <div key={connection.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{connection.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {connection.phoneNumber || "Sem numero"} - {connection.provider} - {connection._count?.groups ?? 0} grupos
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge value={connection.status} />
                    <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => editConnection(connection)} title="Editar">
                      <Edit3 size={16} aria-hidden />
                    </button>
                    <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => testConnection(connection.id)} title="Testar">
                      <PlugZap size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
              {!connections.length ? <p className="text-sm text-[var(--muted)]">Nenhuma conexao cadastrada.</p> : null}
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-3 font-semibold text-ink">Grupos</h2>
            <div className="space-y-2">
              {groups.map((group) => (
                <div key={group.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{group.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {group.connection?.name ?? "Conexao"} - {group.externalId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge value={group.isActive ? "ACTIVE" : "PAUSED"} />
                    <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => editGroup(group)} title="Editar grupo">
                      <Edit3 size={16} aria-hidden />
                    </button>
                    <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => deleteGroup(group.id)} title="Excluir grupo">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
              {!groups.length ? <p className="text-sm text-[var(--muted)]">Nenhum grupo cadastrado.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function buildConnectionPayload(form: typeof emptyConnectionForm) {
  const credentials = form.token.trim()
    ? {
        accessToken: form.token.trim(),
        apiToken: form.token.trim(),
        token: form.token.trim()
      }
    : undefined;
  return {
    name: form.name,
    phoneNumber: form.phoneNumber || undefined,
    provider: form.provider,
    phoneNumberId: form.phoneNumberId || undefined,
    credentials,
    config: {
      apiBaseUrl: form.apiBaseUrl || undefined,
      webhookUrl: form.webhookUrl || undefined,
      messageType: form.messageType,
      previewFormat: form.previewFormat,
      removePreviewTitle: form.removePreviewTitle,
      optimizeImage: form.optimizeImage,
      resizeImage: form.resizeImage
    },
    isActive: true
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
