import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { randomBytes } from 'node:crypto'
import { hashPassword } from '@/lib/auth/password'
import { strictPiiCheck } from '@/lib/community/pii-gate'
import type { GenerationInput, ScenarioContent } from '@/lib/scenario/schema'
import { scenarioContentSchema } from '@/lib/scenario/schema'
import { and, eq } from 'drizzle-orm'

const SEED_EMAIL = process.env.SEED_LIBRARY_EMAIL ?? 'library@planwise.local'
const FORCE = process.argv.includes('--force')
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : Number.POSITIVE_INFINITY

// Спецификации 14 эталонных сценариев. КОНТЕНТ генерируется новым per-stage пайплайном
// (ценности + основные смыслы + плотный «Учитель: …»), а не пишется руками.
type Spec = Pick<GenerationInput, 'direction' | 'grade' | 'durationMin' | 'format'> & {
  topic: string
}

const SPECS: Spec[] = [
  {
    direction: 'Патриотическое',
    grade: 4,
    durationMin: 45,
    format: 'классный час',
    topic: 'День народного единства',
  },
  {
    direction: 'Гражданское',
    grade: 7,
    durationMin: 30,
    format: 'беседа',
    topic: 'День Конституции РФ',
  },
  {
    direction: 'Духовно-нравственное',
    grade: 2,
    durationMin: 20,
    format: 'игра',
    topic: 'День матери в России',
  },
  {
    direction: 'Эстетическое',
    grade: 6,
    durationMin: 45,
    format: 'мастерская',
    topic: 'Международный женский день',
  },
  {
    direction: 'Физическое и здоровье',
    grade: 5,
    durationMin: 30,
    format: 'квиз',
    topic: 'Секреты здорового образа жизни',
  },
  {
    direction: 'Трудовое',
    grade: 9,
    durationMin: 30,
    format: 'беседа',
    topic: 'Мир профессий: как выбрать своё дело',
  },
  {
    direction: 'Экологическое',
    grade: 3,
    durationMin: 45,
    format: 'классный час',
    topic: 'Экология и энергосбережение',
  },
  {
    direction: 'Познавательное',
    grade: 8,
    durationMin: 30,
    format: 'квиз',
    topic: 'День российской науки',
  },
  {
    direction: 'Патриотическое',
    grade: 11,
    durationMin: 45,
    format: 'классный час',
    topic: 'День Героев Отечества',
  },
  {
    direction: 'Гражданское',
    grade: 12,
    durationMin: 30,
    format: 'беседа',
    topic: 'Международный день толерантности',
  },
  {
    direction: 'Семейные ценности',
    grade: 5,
    durationMin: 60,
    format: 'киноклуб',
    topic: 'Доброта и взаимопомощь',
  },
  {
    direction: 'Познавательное',
    grade: 9,
    durationMin: 40,
    format: 'дебаты',
    topic: 'Безопасный интернет',
  },
  {
    direction: 'Профориентация',
    grade: 10,
    durationMin: 60,
    format: 'проектная сессия',
    topic: 'Профессии будущего',
  },
  {
    direction: 'Здоровый образ жизни',
    grade: 6,
    durationMin: 40,
    format: 'мастерская',
    topic: 'Мои здоровые привычки',
  },
]

async function main() {
  const { db } = await import('@/db')
  const { users, scenarios, sharedScenarios } = await import('@/db/schema')
  const { embed } = await import('@/lib/gigachat/embeddings')
  const { streamScenario } = await import('@/lib/scenario/stream')

  async function generate(spec: Spec): Promise<ScenarioContent | null> {
    const input: GenerationInput = {
      direction: spec.direction,
      grade: spec.grade,
      topic: spec.topic,
      durationMin: spec.durationMin,
      format: spec.format,
    }
    let captured: ScenarioContent | null = null
    let failed = false
    for await (const ev of streamScenario(input, {
      prematch: (async () => []) as never, // не подмешиваем библиотеку в саму библиотеку
      save: async (c) => {
        captured = c
        return 'seed'
      },
    })) {
      if (ev.type === 'error') failed = true
    }
    return failed ? null : captured
  }

  // 1) seed-владелец источников (не для логина — случайный пароль)
  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_EMAIL))
    .limit(1)
  let userId: string
  if (found) {
    userId = found.id
    console.log(`Seed-владелец уже есть: ${SEED_EMAIL} (id=${userId})`)
  } else {
    const passwordHash = await hashPassword(randomBytes(24).toString('hex'))
    const [createdUser] = await db
      .insert(users)
      .values({ email: SEED_EMAIL, name: 'Библиотека сообщества', passwordHash })
      .returning({ id: users.id })
    if (!createdUser) throw new Error('не удалось создать seed-владельца')
    userId = createdUser.id
    console.log(`Создан seed-владелец: ${SEED_EMAIL} (id=${userId})`)
  }

  if (FORCE) {
    const owned = await db
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(eq(scenarios.userId, userId))
    const ids = owned.map((r) => r.id)
    for (const id of ids) {
      await db.delete(sharedScenarios).where(eq(sharedScenarios.sourceScenarioId, id))
    }
    await db.delete(scenarios).where(eq(scenarios.userId, userId))
    console.log(`--force: удалено источников ${ids.length} и их shared-копии`)
  }

  let created = 0
  let skipped = 0
  let failed = 0
  const specs = SPECS.slice(0, LIMIT)
  for (const spec of specs) {
    // идемпотентность источника по (userId, direction, grade, format, topic)
    const [existingSrc] = await db
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(
        and(
          eq(scenarios.userId, userId),
          eq(scenarios.direction, spec.direction),
          eq(scenarios.grade, spec.grade),
          eq(scenarios.format, spec.format),
          eq(scenarios.topic, spec.topic),
        ),
      )
      .limit(1)
    if (existingSrc) {
      skipped++
      console.log(`= уже есть: "${spec.topic}"`)
      continue
    }

    console.log(
      `… генерирую: "${spec.topic}" (${spec.direction}, кл.${spec.grade}, ${spec.format})`,
    )
    const content = await generate(spec)
    if (!content || !scenarioContentSchema.safeParse(content).success) {
      failed++
      console.warn(`SKIP (генерация): "${spec.topic}"`)
      continue
    }

    const [src] = await db
      .insert(scenarios)
      .values({
        userId,
        title: content.title,
        direction: spec.direction,
        grade: spec.grade,
        durationMin: spec.durationMin,
        format: spec.format,
        topic: spec.topic,
        content,
        inputContext: {
          direction: spec.direction as never,
          grade: spec.grade,
          topic: spec.topic,
          durationMin: spec.durationMin,
          format: spec.format as never,
        },
      })
      .returning({ id: scenarios.id })
    if (!src) throw new Error(`insert сценария не вернул id для "${spec.topic}"`)
    const scenarioId = src.id

    // строгий PII-чек (как кнопка «Поделиться»)
    const check = strictPiiCheck(content)
    if (!check.clean) {
      const kinds = Array.from(new Set(check.remaining.map((m) => m.type))).join(', ')
      console.warn(`SKIP (PII: ${kinds}) "${spec.topic}"`)
      continue
    }

    let vec: number[] | null = null
    try {
      const [v] = await embed([`${spec.direction} ${spec.topic} ${check.anonymized.title}`])
      vec = v ?? null
    } catch (e) {
      console.error(`embedding failed "${spec.topic}" (non-fatal):`, e)
    }

    const [row] = await db
      .insert(sharedScenarios)
      .values({
        sourceScenarioId: scenarioId,
        anonymizedContent: check.anonymized,
        direction: spec.direction,
        grade: spec.grade,
        durationMin: spec.durationMin,
        format: spec.format,
        topic: spec.topic,
        likeCount: 1,
      })
      .returning({ id: sharedScenarios.id })

    if (vec && row) {
      const { sql } = await import('drizzle-orm')
      await db.execute(
        sql`UPDATE shared_scenarios SET embedding = ${`[${vec.join(',')}]`}::vector WHERE id = ${row.id}`,
      )
    }
    created++
    console.log(`+ в библиотеку: "${spec.topic}"`)
  }

  console.log(
    `\nИтого: добавлено ${created}, пропущено ${skipped}, ошибок генерации ${failed}, всего спек ${specs.length}`,
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
