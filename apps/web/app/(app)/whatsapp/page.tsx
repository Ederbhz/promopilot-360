"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Edit3, LogOut, PlugZap, Plus, QrCode, RefreshCw, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson, putJson } from "@/lib/api";

interface WhatsAppConnection {
  id: string;
  name: string;
  sessionName?: string | null;
  phoneNumber?: string | null;
  provider: string;
  status: string;
  qrCode?: string | null;
  lastConnectedAt?: string | null;
  lastError?: string | null;
  dailyLimit: number;
  minIntervalSeconds: number;
  config?: Record<string, unknown> | null;
  isActive: boolean;
  _count?: { groups: number };
}

interface WhatsAppGroup {
  id: string;
  connectionId: string;
  name: string;
  externalId: string;
  description?: string | null;
  category?: string | null;
  type: string;
  minIntervalSeconds: number;
  dailyLimit: number;
  notes?: string | null;
  isActive: boolean;
  connection?: { name: string; provider: string };
}

interface AvailableGroup {
  externalId: string;
  name: string;
}

const emptyConnectionForm = {
  name: "",
  sessionName: "promopilot360",
  phoneNumber: "",
  dailyLimit: 100,
  minIntervalSeconds: 60,
  messageType: "TEXT_IMAGE",
  optimizeImage: false,
  resizeImage: true
};

const emptyGroupForm = {
  connectionId: "",
  name: "",
  externalId: "",
  description: "",
  category: "",
  minIntervalSeconds: 60,
  dailyLimit: 100,
  notes: "",
  isActive: true
};

export default function WhatsAppPage() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [availableGroups, setAvailableGroups] = useState<AvailableGroup[]>([]);
  const [connectionForm, setConnectionForm] = useState(emptyConnectionForm);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [editingConnectionId, setEditingConnectionId] = useState("");
  const [editingGroupId, setEditingGroupId] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === selectedConnectionId) ?? connections[0],
    [connections, selectedConnectionId]
  );

  async function load() {
    const [connectionData, groupData] = await Promise.all([
      apiFetch<WhatsAppConnection[]>("/whatsapp/connections"),
      apiFetch<WhatsAppGroup[]>("/whatsapp/groups")
    ]);
    setConnections(connectionData);
    setGroups(groupData);
    const firstConnectionId = connectionData[0]?.id ?? "";
    if (!selectedConnectionId && firstConnectionId) setSelectedConnectionId(firstConnectionId);
    if (!groupForm.connectionId && firstConnectionId) {
      setGroupForm((current) => ({ ...current, connectionId: firstConnectionId }));
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar WhatsApp."));
  }, []);

  useEffect(() => {
    if (!selectedConnection?.id) return;
    const interval = window.setInterval(() => {
      refreshStatus(selectedConnection.id, false).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [selectedConnection?.id]);

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
        description: groupForm.description || undefined,
        category: groupForm.category || undefined,
        type: "GROUP",
        minIntervalSeconds: Number(groupForm.minIntervalSeconds),
        dailyLimit: Number(groupForm.dailyLimit),
        notes: groupForm.notes || undefined,
        isActive: groupForm.isActive
      };
      if (editingGroupId) {
        await putJson(`/whatsapp/groups/${editingGroupId}`, body);
      } else {
        await postJson("/whatsapp/groups", body);
      }
      setGroupForm({ ...emptyGroupForm, connectionId: selectedConnection?.id ?? connections[0]?.id ?? "" });
      setEditingGroupId("");
      await load();
      setMessage(editingGroupId ? "Grupo atualizado." : "Grupo cadastrado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar grupo.");
    }
  }

  async function startConnection(id: string) {
    setError("");
    setMessage("");
    setBusyAction("start");
    try {
      const connection = await postJson<WhatsAppConnection>(`/whatsapp/connections/${id}/start`, {});
      await load();
      setSelectedConnectionId(connection.id);
      setMessage(connection.status === "CONNECTED" ? "Sessao conectada." : "QRCode atualizado.");
    } catch (err) {
      await load().catch(() => undefined);
      setError(err instanceof Error ? err.message : "Falha ao conectar sessao.");
    } finally {
      setBusyAction("");
    }
  }

  async function logoutConnection(id: string) {
    setError("");
    setMessage("");
    setBusyAction("logout");
    try {
      await postJson(`/whatsapp/connections/${id}/logout`, {});
      await load();
      setMessage("Sessao desconectada.");
    } catch (err) {
      await load().catch(() => undefined);
      setError(err instanceof Error ? err.message : "Falha ao desconectar sessao.");
    } finally {
      setBusyAction("");
    }
  }

  async function restartConnection(id: string) {
    setError("");
    setMessage("");
    setBusyAction("restart");
    try {
      const connection = await postJson<WhatsAppConnection>(`/whatsapp/connections/${id}/restart`, {});
      await load();
      setSelectedConnectionId(connection.id);
      setMessage("Sessao reiniciada.");
    } catch (err) {
      await load().catch(() => undefined);
      setError(err instanceof Error ? err.message : "Falha ao reiniciar sessao.");
    } finally {
      setBusyAction("");
    }
  }

  async function refreshStatus(id: string, showMessage = true) {
    if (showMessage) {
      setError("");
      setMessage("");
      setBusyAction("status");
    }
    try {
      const connection = await apiFetch<WhatsAppConnection>(`/whatsapp/connections/${id}/session/status`);
      setConnections((current) => current.map((item) => (item.id === id ? connection : item)));
      if (showMessage) setMessage(`Status: ${connection.status}`);
    } catch (err) {
      await load().catch(() => undefined);
      if (showMessage) setError(err instanceof Error ? err.message : "Falha ao atualizar status.");
      throw err;
    } finally {
      if (showMessage) setBusyAction("");
    }
  }

  async function testConnection(id: string) {
    setError("");
    setMessage("");
    setBusyAction("test");
    try {
      const result = await postJson<{ message?: string; ok: boolean }>(`/whatsapp/connections/${id}/test`, {});
      await load();
      setMessage(result.message || (result.ok ? "Conexao ativa." : "Conexao pendente."));
    } catch (err) {
      await load().catch(() => undefined);
      setError(err instanceof Error ? err.message : "Falha ao testar conexao.");
    } finally {
      setBusyAction("");
    }
  }

  async function findAvailableGroups(id: string) {
    setError("");
    setMessage("");
    setBusyAction("groups");
    try {
      setAvailableGroups(await apiFetch<AvailableGroup[]>(`/whatsapp/connections/${id}/available-groups`));
      setMessage("Grupos carregados da sessao.");
    } catch (err) {
      await load().catch(() => undefined);
      setError(err instanceof Error ? err.message : "Falha ao listar grupos.");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteGroup(id: string) {
    setError("");
    setMessage("");
    try {
      await apiFetch(`/whatsapp/groups/${id}`, { method: "DELETE" });
      await load();
      setMessage("Grupo inativado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao inativar grupo.");
    }
  }

  function editConnection(connection: WhatsAppConnection) {
    const config = connection.config ?? {};
    setEditingConnectionId(connection.id);
    setSelectedConnectionId(connection.id);
    setConnectionForm({
      name: connection.name,
      sessionName: connection.sessionName ?? (stringValue(config.sessionName) || "promopilot360"),
      phoneNumber: connection.phoneNumber ?? "",
      dailyLimit: connection.dailyLimit ?? 100,
      minIntervalSeconds: connection.minIntervalSeconds ?? 60,
      messageType: stringValue(config.messageType) || "TEXT_IMAGE",
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
      description: group.description ?? "",
      category: group.category ?? "",
      minIntervalSeconds: group.minIntervalSeconds ?? 60,
      dailyLimit: group.dailyLimit ?? 100,
      notes: group.notes ?? "",
      isActive: group.isActive
    });
  }

  function useAvailableGroup(group: AvailableGroup) {
    setGroupForm((current) => ({
      ...current,
      connectionId: selectedConnection?.id ?? current.connectionId,
      name: group.name,
      externalId: group.externalId
    }));
  }

  return (
    <>
      <PageHeader title="WhatsApp" eyebrow="WPPConnect" />
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
                  <span className="mb-1 block text-sm font-medium">Sessao</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.sessionName}
                    onChange={(event) => setConnectionForm({ ...connectionForm, sessionName: event.target.value })}
                    required
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Numero</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={connectionForm.phoneNumber}
                    onChange={(event) => setConnectionForm({ ...connectionForm, phoneNumber: event.target.value })}
                    placeholder="5531999999999"
                  />
                </label>
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
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Intervalo minimo</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="number"
                    min={10}
                    value={connectionForm.minIntervalSeconds}
                    onChange={(event) => setConnectionForm({ ...connectionForm, minIntervalSeconds: Number(event.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Limite diario</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="number"
                    min={1}
                    value={connectionForm.dailyLimit}
                    onChange={(event) => setConnectionForm({ ...connectionForm, dailyLimit: Number(event.target.value) })}
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
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
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90"
                disabled={Boolean(busyAction)}
              >
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Categoria</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={groupForm.category}
                    onChange={(event) => setGroupForm({ ...groupForm, category: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Descricao</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={groupForm.description}
                    onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Intervalo minimo</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="number"
                    min={10}
                    value={groupForm.minIntervalSeconds}
                    onChange={(event) => setGroupForm({ ...groupForm, minIntervalSeconds: Number(event.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Limite diario</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    type="number"
                    min={1}
                    value={groupForm.dailyLimit}
                    onChange={(event) => setGroupForm({ ...groupForm, dailyLimit: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Observacao</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={groupForm.notes}
                  onChange={(event) => setGroupForm({ ...groupForm, notes: event.target.value })}
                />
              </label>
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
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-ink">Sessao WhatsApp</h2>
              {selectedConnection ? <StatusBadge value={selectedConnection.status} /> : null}
            </div>
            {selectedConnection ? (
              <div className="space-y-3">
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={selectedConnection.id}
                  onChange={(event) => setSelectedConnectionId(event.target.value)}
                >
                  {connections.map((connection) => (
                    <option value={connection.id} key={connection.id}>
                      {connection.name}
                    </option>
                  ))}
                </select>
                {selectedConnection.qrCode ? (
                  <div className="flex justify-center rounded-md border border-[var(--border)] bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedConnection.qrCode} alt="QRCode WhatsApp" className="h-56 w-56 object-contain" />
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
                    <QrCode size={28} aria-hidden />
                  </div>
                )}
                {selectedConnection.lastConnectedAt ? (
                  <p className="text-xs text-[var(--muted)]">
                    Ultima conexao: {new Date(selectedConnection.lastConnectedAt).toLocaleString("pt-BR")}
                  </p>
                ) : null}
                {selectedConnection.lastError ? <p className="text-sm text-coral">{selectedConnection.lastError}</p> : null}
                <div className="grid grid-cols-2 gap-2">
                  <IconButton
                    label={busyAction === "start" ? "Conectando..." : "Conectar"}
                    icon={<PlugZap size={16} aria-hidden />}
                    onClick={() => startConnection(selectedConnection.id)}
                    disabled={Boolean(busyAction)}
                  />
                  <IconButton
                    label={busyAction === "status" ? "Atualizando..." : "Atualizar"}
                    icon={<RefreshCw size={16} aria-hidden />}
                    onClick={() => refreshStatus(selectedConnection.id)}
                    disabled={Boolean(busyAction)}
                  />
                  <IconButton
                    label={busyAction === "restart" ? "Reiniciando..." : "Reiniciar"}
                    icon={<RotateCcw size={16} aria-hidden />}
                    onClick={() => restartConnection(selectedConnection.id)}
                    disabled={Boolean(busyAction)}
                  />
                  <IconButton
                    label={busyAction === "logout" ? "Saindo..." : "Desconectar"}
                    icon={<LogOut size={16} aria-hidden />}
                    onClick={() => logoutConnection(selectedConnection.id)}
                    disabled={Boolean(busyAction)}
                  />
                </div>
                <button
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
                  onClick={() => findAvailableGroups(selectedConnection.id)}
                  disabled={Boolean(busyAction)}
                >
                  <Search size={16} aria-hidden />
                  {busyAction === "groups" ? "Carregando grupos..." : "Listar grupos da sessao"}
                </button>
                {availableGroups.length ? (
                  <div className="space-y-2">
                    {availableGroups.map((group) => (
                      <button
                        className="focus-ring flex w-full items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-left hover:bg-mist"
                        key={group.externalId}
                        onClick={() => useAvailableGroup(group)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{group.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">{group.externalId}</span>
                        </span>
                        <Plus size={16} aria-hidden />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Nenhuma conexao cadastrada.</p>
            )}
          </Panel>

          <Panel>
            <h2 className="mb-3 font-semibold text-ink">Numeros conectados</h2>
            <div className="space-y-2">
              {connections.map((connection) => (
                <div key={connection.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2">
                  <button className="min-w-0 text-left" onClick={() => setSelectedConnectionId(connection.id)}>
                    <p className="truncate text-sm font-semibold">{connection.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {connection.phoneNumber || connection.sessionName || "Sem numero"} - {connection._count?.groups ?? 0} grupos
                    </p>
                  </button>
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
                    <p className="text-xs text-[var(--muted)]">
                      {group.minIntervalSeconds}s - {group.dailyLimit}/dia
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge value={group.isActive ? "ACTIVE" : "PAUSED"} />
                    <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => editGroup(group)} title="Editar grupo">
                      <Edit3 size={16} aria-hidden />
                    </button>
                    <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => deleteGroup(group.id)} title="Inativar grupo">
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

function IconButton({
  disabled,
  icon,
  label,
  onClick
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function buildConnectionPayload(form: typeof emptyConnectionForm) {
  return {
    name: form.name,
    sessionName: form.sessionName || undefined,
    phoneNumber: form.phoneNumber || undefined,
    dailyLimit: Number(form.dailyLimit),
    minIntervalSeconds: Number(form.minIntervalSeconds),
    config: {
      sessionName: form.sessionName || undefined,
      messageType: form.messageType,
      optimizeImage: form.optimizeImage,
      resizeImage: form.resizeImage
    },
    isActive: true
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
