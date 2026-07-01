export function LoadingLine() {
  return <div className="rounded-md border border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)]">Carregando...</div>;
}

export function ErrorLine({ message }: { message: string }) {
  return <div className="rounded-md border border-coral/30 bg-coral/5 p-4 text-sm text-coral">{message}</div>;
}
