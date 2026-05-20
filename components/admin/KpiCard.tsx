export function KpiCard({
  label,
  value,
  hint,
}: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg bg-neutral-0 p-4 shadow-card ring-1 ring-neutral-200">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-neutral-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  )
}
