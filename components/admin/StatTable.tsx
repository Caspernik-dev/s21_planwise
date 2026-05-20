export function StatTable({
  columns,
  rows,
}: {
  columns: [string, string]
  rows: Array<{ label: string; value: string | number }>
}) {
  if (rows.length === 0) return <p className="text-sm text-neutral-400">Нет данных</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-neutral-500">
          <th className="pb-2 font-medium">{columns[0]}</th>
          <th className="pb-2 text-right font-medium">{columns[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-neutral-100">
            <td className="py-1.5 text-neutral-800">{r.label}</td>
            <td className="py-1.5 text-right tabular-nums text-neutral-600">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
