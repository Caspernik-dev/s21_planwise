import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { sql } from 'drizzle-orm'

// Репрезентативные запросы вида «направление класс тема» по всем направлениям и ступеням.
const QUERIES = [
  'Гражданское 5 Права и обязанности школьника',
  'Гражданское 11 Волонтёрство и помощь другим',
  'Патриотическое 7 День Победы',
  'Патриотическое 9 Память о Великой Отечественной войне',
  'Патриотическое 2 Моя малая Родина',
  'Духовно-нравственное 2 Дружба и взаимопомощь в классе',
  'Духовно-нравственное 11 Нравственный выбор и ответственность',
  'Эстетическое 6 Искусство в нашей жизни',
  'Эстетическое 4 Музыка и настроение',
  'Физическое и здоровье 4 Режим дня и здоровье',
  'Физическое и здоровье 8 Здоровый образ жизни подростка',
  'Трудовое 4 Все профессии важны',
  'Трудовое 9 Как выбрать профессию',
  'Экологическое 4 Береги природу родного края',
  'Экологическое 7 Раздельный сбор мусора',
  'Познавательное 6 Наука вокруг нас',
  'Познавательное 10 Цифровая грамотность и интернет',
  'Гражданское 8 Конституция и права человека',
  'Патриотическое 5 Государственные символы России',
  'Духовно-нравственное 7 Уважение к старшим и традициям семьи',
  'Эстетическое 9 Театр и кино как искусство',
  'Трудовое 6 Профессии будущего',
  'Экологическое 10 Изменение климата и ответственность',
  'Познавательное 3 Удивительный мир вокруг нас',
]

async function main() {
  // Ленивый импорт ПОСЛЕ config(): @/db конструирует postgres-клиент на этапе
  // загрузки модуля, а статические ESM-импорты хойстятся выше config().
  const { db } = await import('@/db')
  const { embed } = await import('@/lib/gigachat/embeddings')

  const sims: number[] = []
  for (const q of QUERIES) {
    const [vec] = await embed([q])
    if (!vec) continue
    const lit = `[${vec.join(',')}]`
    const rows = await db.execute(
      sql`SELECT (1 - (embedding <=> ${lit}::vector)) AS sim
          FROM shared_scenarios
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${lit}::vector ASC
          LIMIT 1`,
    )
    const top = (rows as unknown as Array<{ sim: number }>)[0]?.sim
    const num = typeof top === 'number' ? top : top != null ? Number(top) : undefined
    if (typeof num === 'number' && Number.isFinite(num)) sims.push(num)
    console.log(`${q} -> top sim ${num?.toFixed(3) ?? 'n/a'}`)
  }

  sims.sort((a, b) => a - b)
  const p = (q: number) => sims[Math.floor(sims.length * q)] ?? 0
  console.log('\n=== Распределение top-sim ===')
  console.log(
    `n=${sims.length} min=${sims[0]?.toFixed(3)} p25=${p(0.25).toFixed(3)} median=${p(0.5).toFixed(3)} p75=${p(0.75).toFixed(3)} max=${sims.at(-1)?.toFixed(3)}`,
  )
  console.log(
    'Рекомендация: установите SIMILARITY_THRESHOLD по разрыву между релевантными и нерелевантными запросами (оцените вывод выше; дефолт спеки — 0.78).',
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
