"use client";

import clsx from "clsx";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Search,
  Settings,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearToken, getToken } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/garimpar", label: "Garimpar", icon: Search },
  { href: "/links-manuais", label: "Links", icon: Link2 },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/agendador", label: "Agendador", icon: CalendarClock },
  { href: "/templates", label: "Templates", icon: ClipboardList },
  { href: "/configuracoes", label: "Afiliado", icon: Settings },
  { href: "/relatorios", label: "Relatorios", icon: BarChart3 }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-[var(--border)] bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf text-white">
            <Sparkles size={21} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-leaf">PromoPilot</p>
            <p className="text-xs text-[var(--muted)]">Ofertas no piloto</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "focus-ring flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-leaf text-white shadow-soft"
                    : "text-ink hover:bg-mist hover:text-leaf"
                )}
              >
                <Icon size={18} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-[var(--border)] p-4 lg:block">
          <div className="mb-3 flex items-center gap-2 text-sm text-[var(--muted)]">
            <Gauge size={16} aria-hidden />
            MVP local
          </div>
          <button
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-ink hover:bg-mist"
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
            title="Sair"
          >
            <LogOut size={16} aria-hidden />
            Sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
