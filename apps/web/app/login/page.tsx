"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn, Mail, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { postJson, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@promopilot.local");
  const [password, setPassword] = useState("promopilot123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await postJson<{ token: string }>("/auth/login", { email, password });
      setToken(response.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-md border border-[var(--border)] bg-white p-5 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-leaf text-white">
            <Sparkles size={22} aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink">PromoPilot 360</h1>
            <p className="text-sm text-[var(--muted)]">Acesso administrativo</p>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
            <Mail size={15} aria-hidden />
            E-mail
          </span>
          <input
            className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
            <LockKeyhole size={15} aria-hidden />
            Senha
          </span>
          <input
            className="focus-ring w-full rounded-md border border-[var(--border)] px-3 py-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>

        {error ? <p className="mb-3 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

        <button
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-3 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-70"
          disabled={loading}
        >
          <LogIn size={17} aria-hidden />
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
