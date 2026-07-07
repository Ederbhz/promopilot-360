"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, RefreshCw, Save, Tags, Trash2, X } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { apiFetch, deleteJson, postJson, putJson } from "@/lib/api";

interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  _count?: { products: number };
}

const emptyForm = { name: "", description: "" };

export default function CategoriasPage() {
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [brands, setBrands] = useState<TaxonomyItem[]>([]);
  const [categoryForm, setCategoryForm] = useState(emptyForm);
  const [brandForm, setBrandForm] = useState(emptyForm);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingBrandId, setEditingBrandId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [categoryData, brandData] = await Promise.all([
      apiFetch<TaxonomyItem[]>("/categories"),
      apiFetch<TaxonomyItem[]>("/brands")
    ]);
    setCategories(categoryData);
    setBrands(brandData);
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar categorias."))
      .finally(() => setLoading(false));
  }, []);

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    await saveTaxonomy({
      basePath: "/categories",
      editingId: editingCategoryId,
      form: categoryForm,
      reset: () => {
        setEditingCategoryId("");
        setCategoryForm(emptyForm);
      },
      savedMessage: editingCategoryId ? "Categoria atualizada." : "Categoria cadastrada."
    });
  }

  async function saveBrand(event: FormEvent) {
    event.preventDefault();
    await saveTaxonomy({
      basePath: "/brands",
      editingId: editingBrandId,
      form: brandForm,
      reset: () => {
        setEditingBrandId("");
        setBrandForm(emptyForm);
      },
      savedMessage: editingBrandId ? "Marca atualizada." : "Marca cadastrada."
    });
  }

  async function saveTaxonomy(input: {
    basePath: "/categories" | "/brands";
    editingId: string;
    form: typeof emptyForm;
    reset: () => void;
    savedMessage: string;
  }) {
    setError("");
    setMessage("");
    try {
      const payload = {
        name: input.form.name,
        description: blankToUndefined(input.form.description)
      };
      if (input.editingId) {
        await putJson(`${input.basePath}/${input.editingId}`, payload);
      } else {
        await postJson(input.basePath, payload);
      }
      input.reset();
      await load();
      setMessage(input.savedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    }
  }

  async function removeTaxonomy(path: "/categories" | "/brands", item: TaxonomyItem) {
    if (!window.confirm(`Arquivar "${item.name}"?`)) return;
    setError("");
    setMessage("");
    try {
      await deleteJson<void>(`${path}/${item.id}`);
      await load();
      setMessage(path === "/categories" ? "Categoria arquivada." : "Marca arquivada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao arquivar.");
    }
  }

  if (loading) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Categorias e marcas"
        eyebrow="Catalogo"
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

      {error ? <div className="mb-4"><ErrorLine message={error} /></div> : null}
      {message ? <p className="mb-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <TaxonomyForm
            title="Categorias"
            form={categoryForm}
            editing={Boolean(editingCategoryId)}
            onSubmit={saveCategory}
            onChange={setCategoryForm}
            onCancel={() => {
              setEditingCategoryId("");
              setCategoryForm(emptyForm);
            }}
          />
          <TaxonomyTable
            items={categories}
            onEdit={(item) => {
              setEditingCategoryId(item.id);
              setCategoryForm({ name: item.name, description: item.description ?? "" });
            }}
            onRemove={(item) => removeTaxonomy("/categories", item)}
          />
        </Panel>

        <Panel>
          <TaxonomyForm
            title="Marcas"
            form={brandForm}
            editing={Boolean(editingBrandId)}
            onSubmit={saveBrand}
            onChange={setBrandForm}
            onCancel={() => {
              setEditingBrandId("");
              setBrandForm(emptyForm);
            }}
          />
          <TaxonomyTable
            items={brands}
            onEdit={(item) => {
              setEditingBrandId(item.id);
              setBrandForm({ name: item.name, description: item.description ?? "" });
            }}
            onRemove={(item) => removeTaxonomy("/brands", item)}
          />
        </Panel>
      </div>
    </>
  );
}

function TaxonomyForm({
  title,
  form,
  editing,
  onSubmit,
  onChange,
  onCancel
}: {
  title: string;
  form: typeof emptyForm;
  editing: boolean;
  onSubmit: (event: FormEvent) => void;
  onChange: (form: typeof emptyForm) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="sm:col-span-2 flex items-center gap-2">
        <Tags size={18} className="text-leaf" aria-hidden />
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      <label>
        <span className="mb-1 block text-sm font-medium">Nome</span>
        <input
          className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          required
        />
      </label>
      <div className="flex items-end gap-2">
        <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90">
          <Save size={16} aria-hidden />
          {editing ? "Salvar" : "Criar"}
        </button>
        {editing ? (
          <button
            className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
            onClick={onCancel}
            type="button"
            title="Cancelar"
          >
            <X size={17} aria-hidden />
          </button>
        ) : null}
      </div>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium">Descricao</span>
        <input
          className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
        />
      </label>
    </form>
  );
}

function TaxonomyTable({
  items,
  onEdit,
  onRemove
}: {
  items: TaxonomyItem[];
  onEdit: (item: TaxonomyItem) => void;
  onRemove: (item: TaxonomyItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="py-2 pr-3">Nome</th>
            <th className="py-2 pr-3">Slug</th>
            <th className="py-2 pr-3">Produtos</th>
            <th className="py-2 pr-3 text-right">Acoes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="py-3 pr-3 font-medium">{item.name}</td>
              <td className="py-3 pr-3 text-[var(--muted)]">{item.slug}</td>
              <td className="py-3 pr-3">{item._count?.products ?? 0}</td>
              <td className="py-3 pr-3">
                <div className="flex justify-end gap-2">
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => onEdit(item)}
                    type="button"
                    title="Editar"
                  >
                    <Edit3 size={16} aria-hidden />
                  </button>
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    onClick={() => onRemove(item)}
                    type="button"
                    title="Arquivar"
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
  );
}

function blankToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}
