export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-neutral-0 p-5 shadow-card ring-1 ring-neutral-200">
      <h2 className="mb-4 font-display text-lg font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  )
}
