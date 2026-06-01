/**
 * Backfill saved scenarios to the new format:
 *   - leadingValue        ← DIRECTION_TO_LEADING_VALUE[direction]            (РоВ/event)
 *   - personalResults     ← top-3 из ФГОС-каталога (level × direction)       (РоВ/event)
 *   - metaSubjectResults  ← по 1 пункту из каждой группы УУД-каталога        (все типы)
 *   - valueFormulations   ← конверсия легаси `values: string[]`              (РоВ/event)
 *   - videoSearchQuery    ← fallback-запрос + санитизация text у video-блоков (все типы)
 *
 * Idempotent. Dry-run по умолчанию. Каждое обновление = транзакция UPDATE + INSERT scenario_versions.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-scenario-format.ts                # dry-run, всё
 *   pnpm exec tsx scripts/backfill-scenario-format.ts --apply        # write
 *   pnpm exec tsx scripts/backfill-scenario-format.ts --only <user>  # один пользователь
 *   pnpm exec tsx scripts/backfill-scenario-format.ts --force        # перезаписать непустое
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const force = args.includes('--force')
  const onlyIdx = args.indexOf('--only')
  const onlyUser = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined

  const { db } = await import('../db')
  const { scenarios, scenarioVersions } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')
  const { scenarioContentSchema } = await import('../lib/scenario/schema')
  const { DIRECTION_TO_LEADING_VALUE, VALUES_809 } = await import('../lib/scenario/values-809')
  const { getCatalog, selectPersonalResults } = await import('../lib/scenario/personal-results')
  const { getMetaCatalog, selectMetaResults } = await import('../lib/scenario/meta-results')
  const { gradeToLevel } = await import('../lib/scenario/levels')
  const { fallbackSearchQuery, sanitizeRutubeText } = await import('../lib/scenario/rutube')

  const VALUES_SET = new Set<string>(VALUES_809 as readonly string[])

  console.log(
    `mode: ${apply ? 'APPLY' : 'DRY-RUN'}${force ? ' (FORCE)' : ''}${onlyUser ? ` only user=${onlyUser}` : ''}`,
  )

  const rows = onlyUser
    ? await db.select().from(scenarios).where(eq(scenarios.userId, onlyUser))
    : await db.select().from(scenarios)

  console.log(`scenarios in scope: ${rows.length}`)

  let processed = 0
  let unchanged = 0
  let updated = 0
  let invalid = 0
  const stats = {
    leadingValue: 0,
    personalResults: 0,
    metaSubjectResults: 0,
    valueFormulations: 0,
    videoSearchQuery: 0,
  }

  for (const row of rows) {
    processed++
    const original = row.content as Record<string, unknown> | null
    if (!original || typeof original !== 'object') {
      invalid++
      continue
    }

    const next: Record<string, unknown> = structuredClone(original)
    const isRovLike = row.lessonType === 'rov' || row.lessonType === 'event'

    // 1. leadingValue (РоВ/event)
    if (isRovLike) {
      const cur = next.leadingValue
      const has = typeof cur === 'string' && VALUES_SET.has(cur)
      if (!has || force) {
        const mapped =
          DIRECTION_TO_LEADING_VALUE[row.direction as keyof typeof DIRECTION_TO_LEADING_VALUE]
        if (mapped && next.leadingValue !== mapped) {
          next.leadingValue = mapped
          stats.leadingValue++
        }
      }
    }

    // 2. personalResults (РоВ/event, иначе direction не каноничен)
    if (isRovLike) {
      const cur = next.personalResults
      const has = Array.isArray(cur) && cur.length >= 3
      if (!has || force) {
        try {
          const level = gradeToLevel(row.grade)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const catalog = getCatalog(level, row.direction as any)
          if (catalog.length > 0) {
            const selected = selectPersonalResults(
              Array.isArray(cur) ? (cur as string[]) : undefined,
              catalog,
            ).slice(0, 3)
            if (JSON.stringify(selected) !== JSON.stringify(cur)) {
              next.personalResults = selected
              stats.personalResults++
            }
          }
        } catch {
          // bad direction для каталога — пропускаем поле, остальное продолжаем
        }
      }
    }

    // 3. metaSubjectResults (все типы — УУД универсальны)
    {
      const cur = next.metaSubjectResults as
        | { cognitive?: unknown; communicative?: unknown; regulatory?: unknown }
        | undefined
      const has =
        cur &&
        Array.isArray(cur.cognitive) &&
        cur.cognitive.length > 0 &&
        Array.isArray(cur.communicative) &&
        cur.communicative.length > 0 &&
        Array.isArray(cur.regulatory) &&
        cur.regulatory.length > 0
      if (!has || force) {
        try {
          const level = gradeToLevel(row.grade)
          const catalog = getMetaCatalog(level)
          const selected = selectMetaResults(
            cur as Parameters<typeof selectMetaResults>[0],
            catalog,
          )
          if (JSON.stringify(selected) !== JSON.stringify(cur)) {
            next.metaSubjectResults = selected
            stats.metaSubjectResults++
          }
        } catch {
          // пропускаем
        }
      }
    }

    // 4. valueFormulations ← легаси values (РоВ/event)
    if (isRovLike) {
      const formulations = next.valueFormulations
      const legacy = next.values
      const hasNew = Array.isArray(formulations) && formulations.length > 0
      const hasLegacy = Array.isArray(legacy) && legacy.length > 0
      if (hasLegacy && (!hasNew || force)) {
        const leading =
          (typeof next.leadingValue === 'string' && VALUES_SET.has(next.leadingValue)
            ? next.leadingValue
            : undefined) ??
          DIRECTION_TO_LEADING_VALUE[row.direction as keyof typeof DIRECTION_TO_LEADING_VALUE] ??
          VALUES_809[0]
        const built = (legacy as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .slice(0, 8)
          .map((v) => ({ text: v.trim(), basedOn: leading }))
        if (built.length > 0) {
          next.valueFormulations = built
          stats.valueFormulations++
        }
      }
    }

    // 5. videoSearchQuery + санитизация video-text (все типы)
    if (Array.isArray(next.stages)) {
      let touched = false
      const leading =
        isRovLike && typeof next.leadingValue === 'string' ? next.leadingValue : undefined
      for (const stage of next.stages as Array<Record<string, unknown>>) {
        const activities = stage?.activities
        if (!Array.isArray(activities)) continue
        for (const a of activities as Array<Record<string, unknown>>) {
          if (a?.type !== 'video') continue
          // санитизация text
          if (typeof a.text === 'string') {
            const cleaned = sanitizeRutubeText(a.text)
            if (cleaned !== a.text) {
              a.text = cleaned
              touched = true
            }
          }
          // videoSearchQuery
          const cur = typeof a.videoSearchQuery === 'string' ? a.videoSearchQuery.trim() : ''
          const looksUrl = cur.startsWith('http://') || cur.startsWith('https://')
          if (!cur || looksUrl || force) {
            const q = fallbackSearchQuery(row.topic, row.direction ?? undefined, leading)
            if (q && a.videoSearchQuery !== q) {
              a.videoSearchQuery = q
              touched = true
            }
          }
        }
      }
      if (touched) stats.videoSearchQuery++
    }

    if (JSON.stringify(next) === JSON.stringify(original)) {
      unchanged++
      continue
    }

    const parsed = scenarioContentSchema.safeParse(next)
    if (!parsed.success) {
      console.warn(
        `  SKIP ${row.id}: validation failed — ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      )
      invalid++
      continue
    }

    updated++

    if (apply) {
      await db.transaction(async (tx) => {
        await tx
          .update(scenarios)
          .set({ content: parsed.data, updatedAt: new Date() })
          .where(eq(scenarios.id, row.id))
        await tx.insert(scenarioVersions).values({
          scenarioId: row.id,
          content: parsed.data,
        })
      })
    }
  }

  console.log('---')
  console.log(`Processed: ${processed}`)
  console.log(`${apply ? 'Updated' : 'Would update'}: ${updated}`)
  console.log(`Unchanged: ${unchanged}`)
  console.log(`Invalid:   ${invalid}`)
  console.log('Filled by field (count of scenarios touched):')
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`)
  if (!apply && updated > 0) console.log('\nRun again with --apply to write changes.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
