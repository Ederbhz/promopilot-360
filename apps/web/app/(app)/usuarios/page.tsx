"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, RefreshCw, Save, Trash2, UserPlus, X } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, deleteJson, postJson, putJson } from "@/lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  updatedAt: string;
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  isActive: true
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingUserId, setEditingUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const data = await apiFetch<User[]>("/users");
    setUsers(data);
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar usuarios."))
      .finally(() => setLoading(false));
  }, []);

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: blankToUndefined(form.password),
        isActive: form.isActive
      };
      if (editingUserId) {
        await putJson(`/users/${editingUserId}`, payload);
      } else {
        await postJson("/users", { ...payload, password: form.password });
      }
      setMessage(editingUserId ? "Usuario atualizado." : "Usuario cadastrado.");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateUser(user: User) {
    if (!window.confirm(`Desativar "${user.name}"?`)) return;
    setError("");
    setMessage("");
    try {
      await deleteJson<void>(`/users/${user.id}`);
      await load();
      setMessage("Usuario desativado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desativar usuario.");
    }
  }

  function editUser(user: User) {
    setEditingUserId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      isActive: user.isActive
    });
    setError("");
    setMessage("");
  }

  function resetForm() {
    setEditingUserId("");
    setForm(emptyForm);
  }

  if (loading) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Usuarios"
        eyebrow="Acesso"
        actions={
          <button
            className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-mist"
            onClick={() => load()}
            type="button"
          >
            <RefreshCw size={16} aria-hidden />
            Atualizar
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <form onSubmit={saveUser} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nome</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">E-mail</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                type="email"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Senha</span>
              <input
                className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                minLength={8}
                required={!editingUserId}
                type="password"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                type="checkbox"
              />
              Ativo
            </label>
            <button
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-70"
              disabled={saving}
            >
              {editingUserId ? <Save size={17} aria-hidden /> : <UserPlus size={17} aria-hidden />}
              {saving ? "Salvando..." : editingUserId ? "Salvar" : "Cadastrar"}
            </button>
            {editingUserId ? (
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-semibold hover:bg-mist"
                onClick={resetForm}
                type="button"
              >
                <X size={17} aria-hidden />
                Cancelar
              </button>
            ) : null}
          </form>
          {error ? <div className="mt-4"><ErrorLine message={error} /></div> : null}
          {message ? <p className="mt-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
        </Panel>

        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">E-mail</th>
                  <th className="py-2 pr-3">Perfil</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Atualizado</th>
                  <th className="py-2 pr-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-3 pr-3 font-medium">{user.name}</td>
                    <td className="py-3 pr-3">{user.email}</td>
                    <td className="py-3 pr-3">{user.role}</td>
                    <td className="py-3 pr-3">
                      <StatusBadge value={user.isActive ? "ACTIVE" : "PAUSED"} />
                    </td>
                    <td className="py-3 pr-3">{formatDate(user.updatedAt)}</td>
                    <td className="py-3 pr-3">
                      <div className="flex justify-end gap-2">
                        <button
                          className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                          onClick={() => editUser(user)}
                          type="button"
                          title="Editar"
                        >
                          <Edit3 size={16} aria-hidden />
                        </button>
                        <button
                          className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                          onClick={() => deactivateUser(user)}
                          type="button"
                          title="Desativar"
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </div>
                    </td>
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

function blankToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
