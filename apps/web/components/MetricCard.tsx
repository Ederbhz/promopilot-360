import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "leaf"
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "leaf" | "saffron" | "coral" | "ink";
}) {
  const toneClass = {
    leaf: "bg-leaf text-white",
    saffron: "bg-saffron text-white",
    coral: "bg-coral text-white",
    ink: "bg-ink text-white"
  }[tone];

  return (
    <div className="rounded-md border border-[var(--border)] bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>
          <Icon size={18} aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}
