"use client";

import { useEffect, useState } from "react";
import { Ban, Clipboard, ExternalLink, Play, RefreshCw } from "lucide-react";
import { ErrorLine, LoadingLine } from "@/components/AsyncState";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, postJson } from "@/lib/api";

interface ScheduledPost {
  id: string;
  channel: string;
  message: string;
  scheduledAt: string;
  publishedAt?: string | null;
  status: string;
  errorMessage?: string | null;
  campaign?: { name: string } | null;
  whatsappGroup?: { name: string; externalId: string } | null;
  messageSendLogs?: Array<{ status: string; errorMessage?: string | null; attempts: number; createdAt: string }>;
  offer: {
    product: { title: string; imageUrl?: string | null };
    marketplace: { name: string };
  };
}

export default function AgendadorPage() {
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setPosts(await apiFetch<ScheduledPost[]>("/scheduled-posts"));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar fila."));
  }, []);

  async function publish(id: string) {
    await postJson(`/scheduled-posts/${id}/publish-now`, {});
    await load();
    setMessage("Publicacao processada.");
  }

  async function cancel(id: string) {
    await postJson(`/scheduled-posts/${id}/cancel`, {});
    await load();
    setMessage("Publicacao cancelada.");
  }

  async function copy(id: string) {
    const result = await postJson<{ message: string }>(`/scheduled-posts/${id}/copy-whatsapp`, {});
    await navigator.clipboard?.writeText(result.message);
    setMessage("Mensagem copiada.");
  }

  if (error) return <ErrorLine message={error} />;
  if (!posts) return <LoadingLine />;

  return (
    <>
      <PageHeader
        title="Agendador"
        eyebrow="Fila"
        actions={
          <button
            className="focus-ring flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-mist"
            onClick={() => load()}
          >
            <RefreshCw size={16} aria-hidden />
            Atualizar
          </button>
        }
      />
      {message ? <p className="mb-4 rounded-md bg-leaf/10 px-3 py-2 text-sm text-leaf">{message}</p> : null}
      <div className="grid gap-3">
          {posts.map((post) => (
            <Panel key={post.id} className="p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-mist">
                  {post.offer.product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.offer.product.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={post.status} />
                    <span className="text-sm text-[var(--muted)]">{post.channel}</span>
                    <span className="text-sm text-[var(--muted)]">
                      {new Date(post.scheduledAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <h2 className="line-clamp-2 font-semibold text-ink">{post.offer.product.title}</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {post.campaign?.name ?? "Sem campanha"} - {post.offer.marketplace.name}
                  </p>
                  {post.whatsappGroup ? (
                    <p className="text-xs text-[var(--muted)]">Grupo: {post.whatsappGroup.name}</p>
                  ) : null}
                  {post.messageSendLogs?.[0] ? (
                    <p className="text-xs text-[var(--muted)]">
                      Ultimo envio: {post.messageSendLogs[0].status} - tentativa {post.messageSendLogs[0].attempts}
                    </p>
                  ) : null}
                  {post.errorMessage ? <p className="mt-1 text-sm text-coral">{post.errorMessage}</p> : null}
                  {post.messageSendLogs?.[0]?.errorMessage ? (
                    <p className="mt-1 text-sm text-coral">{post.messageSendLogs[0].errorMessage}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2 lg:justify-end">
                <button
                  className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                  title="Copiar mensagem"
                  onClick={() => copy(post.id)}
                >
                  <Clipboard size={17} aria-hidden />
                </button>
                {post.channel === "WHATSAPP" ? (
                  <button
                    className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                    title="Abrir WhatsApp"
                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(post.message)}`, "_blank")}
                  >
                    <ExternalLink size={17} aria-hidden />
                  </button>
                ) : null}
                <button
                  className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                  title="Publicar agora"
                  onClick={() => publish(post.id)}
                >
                  <Play size={17} aria-hidden />
                </button>
                <button
                  className="focus-ring rounded-md border border-[var(--border)] p-2 hover:bg-mist"
                  title="Cancelar"
                  onClick={() => cancel(post.id)}
                >
                  <Ban size={17} aria-hidden />
                </button>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
