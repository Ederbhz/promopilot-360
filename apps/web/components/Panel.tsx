import clsx from "clsx";

export function Panel({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={clsx("rounded-md border border-[var(--border)] bg-white p-4 shadow-soft", className)}>{children}</section>;
}
