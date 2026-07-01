"use client";

import { FormEvent, useEffect, useState } from "react";
import { CopyPlus, Eye, Save } from "lucide-react";
import { ErrorLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { apiFetch, postJson, putJson } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  channel: string;
  content: string;
  isDefault: boolean;
}

const blank = {
  id: "",
  name: "",
  channel: "WHATSAPP",
  content: "{{titulo}}\n\n{{preco_atual}}\n{{link_afiliado}}",
  isDefault: false
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template>(blank);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const data = await apiFetch<Template[]>("/message-templates");
    setTemplates(data);
    if (!selected.id && data[0]) setSelected(data[0]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar templates."));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      name: selected.name,
      channel: selected.channel,
      content: selected.content,
      isDefault: selected.isDefault
    };
    if (selected.id) {
      await putJson(`/message-templates/${selected.id}`, payload);
    } else {
      await postJson("/message-templates", payload);
    }
    await load();
    setMessage("Template salvo.");
  }

  async function showPreview() {
    if (!selected.id) {
      setPreview(selected.content);
      return;
    }
    const result = await postJson<{ message: string }>(`/message-templates/${selected.id}/preview`, {});
    setPreview(result.message);
  }

  return (
    <>
      <PageHeader
        title="Templates"
        eyebrow="Mensagens"
        actions={
          <button
            className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
            onClick={() => setSelected(blank)}
          >
            <CopyPlus size={16} aria-hidden />
            Novo
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Panel className="p-2">
          <div className="space-y-1">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`focus-ring w-full rounded-md px-3 py-2 text-left text-sm hover:bg-mist ${
                  selected.id === template.id ? "bg-leaf text-white hover:bg-leaf" : ""
                }`}
                onClick={() => setSelected(template)}
              >
                <span className="block font-semibold">{template.name}</span>
                <span className={selected.id === template.id ? "text-white/80" : "text-[var(--muted)]"}>
                  {template.channel} {template.isDefault ? "padrao" : ""}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel>
            <form onSubmit={save} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Nome</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={selected.name}
                    onChange={(event) => setSelected({ ...selected, name: event.target.value })}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Canal</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={selected.channel}
                    onChange={(event) => setSelected({ ...selected, channel: event.target.value })}
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="TELEGRAM">Telegram</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.isDefault}
                  onChange={(event) => setSelected({ ...selected, isDefault: event.target.checked })}
                />
                Template padrao
              </label>
              <textarea
                className="focus-ring min-h-[360px] w-full rounded-md border border-[var(--border)] px-3 py-2 font-mono text-sm"
                value={selected.content}
                onChange={(event) => setSelected({ ...selected, content: event.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <button className="focus-ring flex items-center gap-2 rounded-md bg-leaf px-3 py-2 text-sm font-semibold text-white hover:bg-leaf/90">
                  <Save size={16} aria-hidden />
                  Salvar
                </button>
                <button
                  className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-mist"
                  type="button"
                  onClick={showPreview}
                >
                  <Eye size={16} aria-hidden />
                  Preview
                </button>
              </div>
            </form>
          </Panel>

          <Panel>
            <h2 className="mb-3 text-base font-semibold">Preview</h2>
            <pre className="min-h-[360px] whitespace-pre-wrap rounded-md bg-mist p-3 text-sm leading-relaxed">
              {preview || selected.content}
            </pre>
            {error ? <div className="mt-3"><ErrorLine message={error} /></div> : null}
            {message ? <p className="mt-3 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
          </Panel>
        </div>
      </div>
    </>
  );
}
