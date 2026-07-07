"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, FileSearch, Plus, RefreshCw, Rocket, Save, Trash2, X } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, deleteJson, postJson, putJson } from "@/lib/api";

interface Product {
  id: string;
  title: string;
}

interface Category {
  id: string;
  name: string;
}

interface SeoPage {
  id: string;
  tipo: string;
  slug: string;
  tituloSeo: string;
  metaDescription?: string | null;
  h1?: string | null;
  conteudo?: string | null;
  palavraChavePrincipal?: string | null;
  status: string;
  publishedAt?: string | null;
  product?: { title: string } | null;
  category?: { name: string } | null;
  marketplace?: { name: string } | null;
}

const emptyGenerateForm = {
  productId: "",
  categoryId: "",
  tipo: "review",
  palavraChavePrincipal: ""
};

export default function SeoPage() {
  const [pages, setPages] = useState<SeoPage[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [generateForm, setGenerateForm] = useState(emptyGenerateForm);
  const [editing, setEditing] = useState<SeoPage | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const [pageData, productData, categoryData] = await Promise.all([
      apiFetch<SeoPage[]>("/seo/pages"),
      apiFetch<Product[]>("/products"),
      apiFetch<Category[]>("/categories")
    ]);
    setPages(pageData);
    setProducts(productData);
    setCategories(categoryData);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar SEO."));
  }, []);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy("generate");
    setError("");
    setMessage("");
    try {
      await postJson("/seo/pages/generate", {
        productId: generateForm.productId || undefined,
        categoryId: generateForm.categoryId || undefined,
        tipo: generateForm.tipo,
        palavraChavePrincipal: generateForm.palavraChavePrincipal || undefined
      });
      setGenerateForm(emptyGenerateForm);
      await load();
      setMessage("Pagina SEO gerada em rascunho.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar pagina SEO.");
    } finally {
      setBusy("");
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy("edit");
    setError("");
    setMessage("");
    try {
      await putJson(`/seo/pages/${editing.id}`, {
        tipo: editing.tipo,
        slug: editing.slug,
        tituloSeo: editing.tituloSeo,
        metaDescription: editing.metaDescription,
        h1: editing.h1,
        conteudo: editing.conteudo,
        palavraChavePrincipal: editing.palavraChavePrincipal,
        status: editing.status
      });
      setEditing(null);
      await load();
      setMessage("Pagina SEO atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar pagina SEO.");
    } finally {
      setBusy("");
    }
  }

  async function publish(id: string) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await putJson(`/seo/pages/${id}/publish`, {});
      await load();
      setMessage("Pagina SEO publicada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar pagina SEO.");
    } finally {
      setBusy("");
    }
  }

  async function archive(id: string) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await deleteJson(`/seo/pages/${id}`);
      await load();
      setMessage("Pagina SEO arquivada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao arquivar pagina SEO.");
    } finally {
      setBusy("");
    }
  }

  if (error && !pages) return <ErrorLine message={error} />;
  if (!pages) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="SEO"
        eyebrow="Programatico"
        actions={
          <button
            className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
            onClick={() => load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao atualizar."))}
            type="button"
          >
            <RefreshCw size={16} aria-hidden />
            Atualizar
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <Panel>
            <form onSubmit={generate} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Produto</span>
                <select
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={generateForm.productId}
                  onChange={(event) => setGenerateForm({ ...generateForm, productId: event.target.value })}
                >
                  <option value="">Sem produto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Categoria</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={generateForm.categoryId}
                    onChange={(event) => setGenerateForm({ ...generateForm, categoryId: event.target.value })}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Tipo</span>
                  <select
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={generateForm.tipo}
                    onChange={(event) => setGenerateForm({ ...generateForm, tipo: event.target.value })}
                  >
                    <option value="review">Review</option>
                    <option value="cupom">Cupom</option>
                    <option value="categoria">Categoria</option>
                    <option value="melhores_produtos">Melhores produtos</option>
                    <option value="produto_barato">Produto barato</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Palavra-chave</span>
                <input
                  className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                  value={generateForm.palavraChavePrincipal}
                  onChange={(event) => setGenerateForm({ ...generateForm, palavraChavePrincipal: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-60"
                disabled={busy === "generate"}
              >
                <Plus size={17} aria-hidden />
                {busy === "generate" ? "Gerando..." : "Gerar rascunho"}
              </button>
            </form>
          </Panel>

          {editing ? (
            <Panel>
              <form onSubmit={saveEdit} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Titulo SEO</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={editing.tituloSeo}
                    onChange={(event) => setEditing({ ...editing, tituloSeo: event.target.value })}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Slug</span>
                  <input
                    className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={editing.slug}
                    onChange={(event) => setEditing({ ...editing, slug: event.target.value })}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Conteudo</span>
                  <textarea
                    className="focus-ring min-h-56 w-full rounded-md border border-[var(--border)] px-3 py-2"
                    value={editing.conteudo ?? ""}
                    onChange={(event) => setEditing({ ...editing, conteudo: event.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90">
                    <Save size={17} aria-hidden />
                    Salvar
                  </button>
                  <button
                    className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-semibold hover:bg-mist"
                    onClick={() => setEditing(null)}
                    type="button"
                  >
                    <X size={17} aria-hidden />
                    Cancelar
                  </button>
                </div>
              </form>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-3">
          {error ? <ErrorLine message={error} /> : null}
          {message ? <p className="rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
          {pages.map((page) => (
            <Panel key={page.id} className="p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={page.status} />
                    <span className="text-sm text-[var(--muted)]">{page.tipo}</span>
                  </div>
                  <h2 className="flex items-center gap-2 font-semibold text-ink">
                    <FileSearch size={17} aria-hidden />
                    {page.tituloSeo}
                  </h2>
                  <p className="truncate text-sm text-[var(--muted)]">/{page.slug}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{page.metaDescription || page.conteudo}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {page.product?.title || page.category?.name || "Pagina livre"}
                    {page.marketplace?.name ? ` - ${page.marketplace.name}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => setEditing(page)} title="Editar">
                    <Edit3 size={16} aria-hidden />
                  </button>
                  <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => publish(page.id)} title="Publicar">
                    <Rocket size={16} aria-hidden />
                  </button>
                  <button className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist" onClick={() => archive(page.id)} title="Arquivar">
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
          {!pages.length ? <p className="text-sm text-[var(--muted)]">Nenhuma pagina SEO gerada.</p> : null}
        </div>
      </div>
    </>
  );
}
