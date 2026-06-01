/**
 * Регенерирует video-блок для расшаренных РоВ/event-сценариев, у которых
 * нет video-активности ни в одном этапе. Использует существующий per-block
 * пайплайн (regenerateActivity), добавляет блок в КОНЕЦ engage-этапа.
 *
 * Контент остальных этапов и активностей НЕ трогается. Хронометраж этапов
 * (duration_min) не пересчитывается (новый блок встаёт в существующий бюджет).
 *
 * Usage:
 *   pnpm exec tsx scripts/regen-shared-video.ts            # dry-run
 *   pnpm exec tsx scripts/regen-shared-video.ts --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

async function main() {
  const apply = process.argv.includes('--apply')

  const { db } = await import('../db')
  const { sharedScenarios } = await import('../db/schema')
  const { eq, sql } = await import('drizzle-orm')
  const { regenerateActivity } = await import('../lib/scenario/regenerate')
  const { buildRunningContext } = await import('../lib/scenario/context')
  const { scenarioContentSchema } = await import('../lib/scenario/schema')

  console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)

  const rows = await db
    .select()
    .from(sharedScenarios)
    .where(sql`lesson_type IN ('rov', 'event')`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasVideo = (content: any): boolean =>
    Array.isArray(content?.stages) &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content.stages.some((s: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Array.isArray(s?.activities) && s.activities.some((a: any) => a?.type === 'video'),
    )

  const candidates = rows.filter((r) => !hasVideo(r.anonymizedContent))
  console.log(`shared РоВ/event without video activity: ${candidates.length}/${rows.length}`)

  let ok = 0
  let failed = 0
  let invalid = 0

  for (const row of candidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = row.anonymizedContent as any
    const engageIdx = content.stages.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s?.kind === 'engage',
    )
    if (engageIdx === -1) {
      console.warn(`  SKIP ${row.id}: нет engage-этапа`)
      failed++
      continue
    }
    const engage = content.stages[engageIdx]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks = (engage.activities ?? []).map((a: any) => ({
      stageTitle: engage.title,
      type: String(a?.type ?? 'discussion'),
      text: String(a?.text ?? ''),
    }))
    const runningContext = buildRunningContext(blocks)

    const input = {
      lessonType: row.lessonType as 'rov' | 'event',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      direction: row.direction as any,
      grade: row.grade,
      topic: row.topic,
      durationMin: row.durationMin,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      format: row.format as any,
    }
    const skeleton = {
      title: content.title,
      goals: content.goals,
      values: content.values,
      coreMeanings: content.coreMeanings,
      personalResults: content.personalResults,
      metaSubjectResults: content.metaSubjectResults,
      leadingValue: content.leadingValue,
      secondaryValues: content.secondaryValues,
      valueFormulations: content.valueFormulations,
      materials: content.materials,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stages: content.stages.map((s: any) => ({
        kind: s.kind,
        title: s.title,
        duration_min: s.duration_min,
      })),
    }

    console.log(`→ ${row.id} «${content.title}» (engage: ${engage.title})`)
    try {
      const newActivity = await regenerateActivity(
        {
          input,
          skeleton,
          stage: {
            kind: engage.kind,
            title: engage.title,
            duration_min: engage.duration_min,
          },
          targetType: 'video',
          runningContext,
        },
        {},
      )
      const newContent = structuredClone(content)
      newContent.stages[engageIdx].activities.push(newActivity)

      const parsed = scenarioContentSchema.safeParse(newContent)
      if (!parsed.success) {
        console.warn(
          `   validation failed: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        )
        invalid++
        continue
      }

      console.log(
        `   video-блок готов: «${(newActivity.text ?? '').slice(0, 80)}…»  query: "${newActivity.videoSearchQuery ?? '?'}"`,
      )

      if (apply) {
        await db
          .update(sharedScenarios)
          .set({ anonymizedContent: parsed.data })
          .where(eq(sharedScenarios.id, row.id))
        console.log('   ✓ saved')
      } else {
        console.log('   (dry-run) would save')
      }
      ok++
    } catch (e) {
      console.error(`   FAILED: ${(e as Error).message}`)
      failed++
    }
  }

  console.log('---')
  console.log(`OK:      ${ok}`)
  console.log(`Failed:  ${failed}`)
  console.log(`Invalid: ${invalid}`)
  if (!apply && ok > 0) console.log('\nRun again with --apply to write changes.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
