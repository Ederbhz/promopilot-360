const colors: Record<string, string> = {
  ACTIVE: "bg-leaf/10 text-leaf",
  VALID: "bg-leaf/10 text-leaf",
  PUBLISHED: "bg-leaf/10 text-leaf",
  SCHEDULED: "bg-saffron/10 text-saffron",
  READY_TO_SEND: "bg-saffron/10 text-saffron",
  PAUSED: "bg-gray-100 text-gray-700",
  CANCELED: "bg-gray-100 text-gray-700",
  FAILED: "bg-coral/10 text-coral",
  INVALID: "bg-coral/10 text-coral",
  AFFILIATE_LINK_MISSING: "bg-coral/10 text-coral"
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${colors[value] ?? "bg-gray-100 text-gray-700"}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
