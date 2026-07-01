export function PageHeader({
  title,
  eyebrow,
  actions
}: {
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-leaf">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold text-ink">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
