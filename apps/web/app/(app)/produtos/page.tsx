"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, PackagePlus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { apiFetch, deleteJson, postJson, putJson } from "@/lib/api";

interface Marketplace {
  id: string;
  name: string;
}

interface TaxonomyItem {
  id: string;
  name: string;
}

interface Product {
  id: string;
  title: string;
  productUrl: string;
  imageUrl?: string | null;
  brand?: string | null;
  category?: string | null;
  updatedAt: string;
  marketplace: { id: string; name: string };
  categoryRef?: { id: string; name: string } | null;
  brandRef?: { id: string; name: string } | null;
  _count?: { offers: number; generatedContents: number };
}

const emptyForm = {
  marketplaceId: "",
  title: "",
  productUrl: "",
  imageUrl: "",
  category: "",
  brand: "",
  description: ""
};

export default function ProdutosPage() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [brands, setBrands] = useState<TaxonomyItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingProductId, setEditingProductId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load(q = query) {
    const search = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const [marketplaceData, categoryData, brandData, productData] = await Promise.all([
      apiFetch<Marketplace[]>("/marketplaces"),
      apiFetch<TaxonomyItem[]>("/categories"),
      apiFetch<TaxonomyItem[]>("/brands"),
      apiFetch<Product[]>(`/products${search}`)
    ]);
    setMarketplaces(marketplaceData);
    setCategories(categoryData);
    setBrands(brandData);
    setProducts(productData);
    setForm((current) => ({
      ...current,
      marketplaceId: current.marketplaceId || marketplaceData[0]?.id || ""
    }));
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar produtos."))
      .finally(() => setLoading(false));
  }, []);

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        marketplaceId: form.marketplaceId,
        title: form.title,
        productUrl: form.productUrl,
        imageUrl: blankToUndefined(form.imageUrl),
        category: blankToUndefined(form.category),
        brand: blankToUndefined(form.brand),
        description: blankToUndefined(form.description)
      };
      if (editingProductId) {
        await putJson(`/products/${editingProductId}`, payload);
      } else {
        await postJson("/products", payload);
      }
      setMessage(editingProductId ? "Produto atualizado." : "Produto cadastrado.");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  async function searchProducts(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao buscar produtos.");
    }
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`Arquivar "${product.title}"?`)) return;
    setError("");
    setMessage("");
    try {
      await deleteJson<void>(`/products/${product.id}`);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setMessage("Produto arquivado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao arquivar produto.");
    }
  }

  function editProduct(product: Product) {
    setEditingProductId(product.id);
    setForm({
      marketplaceId: product.marketplace.id,
      title: product.title,
      productUrl: product.productUrl,
      imageUrl: product.imageUrl ?? "",
      category: product.categoryRef?.name ?? product.category ?? "",
      brand: product.brandRef?.name ?? product.brand ?? "",
      description: ""
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingProductId("");
    setForm({ ...emptyForm, marketplaceId: marketplaces[0]?.id || "" });
  }

  if (loading) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Produtos"
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

      <Panel className="mb-4">
        <form onSubmit={saveProduct} className="grid gap-3 xl:grid-cols-4">
          <label className="xl:col-span-2">
            <span className="mb-1 block text-sm font-medium">Produto</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Marketplace</span>
            <select
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={form.marketplaceId}
              onChange={(event) => setForm({ ...form, marketplaceId: event.target.value })}
              required
            >
              {marketplaces.map((marketplace) => (
                <option value={marketplace.id} key={marketplace.id}>
                  {marketplace.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Categoria</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              list="produto-categorias"
            />
            <datalist id="produto-categorias">
              {categories.map((category) => (
                <option value={category.name} key={category.id} />
              ))}
            </datalist>
          </label>
          <label className="xl:col-span-2">
            <span className="mb-1 block text-sm font-medium">URL do produto</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={form.productUrl}
              onChange={(event) => setForm({ ...form, productUrl: event.target.value })}
              type="url"
              required
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Imagem</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={form.imageUrl}
              onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
              type="url"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Marca</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={form.brand}
              onChange={(event) => setForm({ ...form, brand: event.target.value })}
              list="produto-marcas"
            />
            <datalist id="produto-marcas">
              {brands.map((brand) => (
                <option value={brand.name} key={brand.id} />
              ))}
            </datalist>
          </label>
          <label className="xl:col-span-3">
            <span className="mb-1 block text-sm font-medium">Descricao</span>
            <input
              className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-70"
              disabled={saving}
            >
              {editingProductId ? <Save size={17} aria-hidden /> : <PackagePlus size={17} aria-hidden />}
              {saving ? "Salvando..." : editingProductId ? "Salvar" : "Cadastrar"}
            </button>
            {editingProductId ? (
              <button
                className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                onClick={resetForm}
                type="button"
                title="Cancelar"
              >
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel>
        <form onSubmit={searchProducts} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="focus-ring min-w-0 flex-1 rounded-md border border-[var(--border)] px-3 py-2"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar produto, categoria, marca ou ID"
          />
          <button className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 font-semibold hover:bg-mist">
            <Search size={16} aria-hidden />
            Buscar
          </button>
        </form>

        {error ? <ErrorLine message={error} /> : null}
        {message ? <p className="mb-3 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3">Marketplace</th>
                <th className="py-2 pr-3">Categoria</th>
                <th className="py-2 pr-3">Marca</th>
                <th className="py-2 pr-3">Ofertas</th>
                <th className="py-2 pr-3">Atualizado</th>
                <th className="py-2 pr-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="max-w-[320px] py-3 pr-3 font-medium">{product.title}</td>
                  <td className="py-3 pr-3">{product.marketplace.name}</td>
                  <td className="py-3 pr-3">{product.categoryRef?.name ?? product.category ?? "-"}</td>
                  <td className="py-3 pr-3">{product.brandRef?.name ?? product.brand ?? "-"}</td>
                  <td className="py-3 pr-3">{product._count?.offers ?? 0}</td>
                  <td className="py-3 pr-3">{formatDate(product.updatedAt)}</td>
                  <td className="py-3 pr-3">
                    <div className="flex justify-end gap-2">
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => editProduct(product)}
                        type="button"
                        title="Editar"
                      >
                        <Edit3 size={16} aria-hidden />
                      </button>
                      <button
                        className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                        onClick={() => removeProduct(product)}
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
      </Panel>
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
