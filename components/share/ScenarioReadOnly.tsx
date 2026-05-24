import type { DocBlock } from '@/lib/export/document-model'

export function ScenarioReadOnly({ blocks }: { blocks: DocBlock[] }) {
  return (
    <article className="space-y-4">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return b.level === 1 ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static non-reordered render
            <h1 key={i} className="text-2xl font-semibold text-neutral-900">
              {b.text}
            </h1>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: static non-reordered render
            <h2 key={i} className="mt-6 text-xl font-semibold text-neutral-800">
              {b.text}
            </h2>
          )
        }
        if (b.type === 'paragraph') {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: static non-reordered render
            <p key={i} className="whitespace-pre-wrap leading-relaxed text-neutral-700">
              {b.text}
            </p>
          )
        }
        if (b.type === 'bullets') {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: static non-reordered render
            <ul key={i} className="list-disc space-y-1 pl-6 text-neutral-700">
              {b.items.map((it, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static non-reordered render
                <li key={j}>{it}</li>
              ))}
            </ul>
          )
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static non-reordered render
          <div key={i} className="flex flex-wrap gap-2">
            {b.rows.map((r) => (
              <span
                key={r.label}
                className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 ring-1 ring-brand-200"
              >
                {r.label}: {r.value}
              </span>
            ))}
          </div>
        )
      })}
    </article>
  )
}
