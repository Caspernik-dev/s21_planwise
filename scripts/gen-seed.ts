import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GenerationInput } from '@/lib/scenario/schema'
import { scenarioToMarkdown } from '@/lib/scenario/to-markdown'

const DIR = join(process.cwd(), 'content', 'seed-scenarios')

const MATRIX: Array<{
  file: string
  input: GenerationInput
  gradeRange: string
  gradeMin: number
  gradeMax: number
}> = [
  {
    file: '01-druzhba-1-2.md',
    gradeRange: '1-2',
    gradeMin: 1,
    gradeMax: 2,
    input: {
      direction: 'Духовно-нравственное',
      grade: 2,
      topic: 'Дружба и взаимопомощь в классе',
      durationMin: 30,
      format: 'классный час',
    },
  },
  {
    file: '02-rodina-1-2.md',
    gradeRange: '1-2',
    gradeMin: 1,
    gradeMax: 2,
    input: {
      direction: 'Патриотическое',
      grade: 2,
      topic: 'Моя малая Родина',
      durationMin: 30,
      format: 'беседа',
    },
  },
  {
    file: '03-priroda-3-4.md',
    gradeRange: '3-4',
    gradeMin: 3,
    gradeMax: 4,
    input: {
      direction: 'Экологическое',
      grade: 4,
      topic: 'Береги природу родного края',
      durationMin: 30,
      format: 'классный час',
    },
  },
  {
    file: '04-trud-3-4.md',
    gradeRange: '3-4',
    gradeMin: 3,
    gradeMax: 4,
    input: {
      direction: 'Трудовое',
      grade: 4,
      topic: 'Все профессии важны',
      durationMin: 30,
      format: 'игра',
    },
  },
  {
    file: '05-zdorovie-3-4.md',
    gradeRange: '3-4',
    gradeMin: 3,
    gradeMax: 4,
    input: {
      direction: 'Физическое и здоровье',
      grade: 4,
      topic: 'Режим дня и здоровье',
      durationMin: 30,
      format: 'квиз',
    },
  },
  {
    file: '06-grazhdanin-5-7.md',
    gradeRange: '5-7',
    gradeMin: 5,
    gradeMax: 7,
    input: {
      direction: 'Гражданское',
      grade: 6,
      topic: 'Права и обязанности школьника',
      durationMin: 45,
      format: 'классный час',
    },
  },
  {
    file: '07-nauka-5-7.md',
    gradeRange: '5-7',
    gradeMin: 5,
    gradeMax: 7,
    input: {
      direction: 'Познавательное',
      grade: 6,
      topic: 'Наука вокруг нас',
      durationMin: 45,
      format: 'квиз',
    },
  },
  {
    file: '08-iskusstvo-5-7.md',
    gradeRange: '5-7',
    gradeMin: 5,
    gradeMax: 7,
    input: {
      direction: 'Эстетическое',
      grade: 6,
      topic: 'Искусство в нашей жизни',
      durationMin: 45,
      format: 'мастерская',
    },
  },
  {
    file: '09-pamyat-8-9.md',
    gradeRange: '8-9',
    gradeMin: 8,
    gradeMax: 9,
    input: {
      direction: 'Патриотическое',
      grade: 9,
      topic: 'Память о Великой Отечественной войне',
      durationMin: 45,
      format: 'классный час',
    },
  },
  {
    file: '10-vybor-professii-8-9.md',
    gradeRange: '8-9',
    gradeMin: 8,
    gradeMax: 9,
    input: {
      direction: 'Трудовое',
      grade: 9,
      topic: 'Как выбрать профессию',
      durationMin: 45,
      format: 'беседа',
    },
  },
  {
    file: '11-cennosti-10-11.md',
    gradeRange: '10-11',
    gradeMin: 10,
    gradeMax: 11,
    input: {
      direction: 'Духовно-нравственное',
      grade: 11,
      topic: 'Нравственный выбор и ответственность',
      durationMin: 45,
      format: 'беседа',
    },
  },
  {
    file: '12-volonterstvo-10-11.md',
    gradeRange: '10-11',
    gradeMin: 10,
    gradeMax: 11,
    input: {
      direction: 'Гражданское',
      grade: 11,
      topic: 'Волонтёрство и помощь другим',
      durationMin: 45,
      format: 'классный час',
    },
  },
]

async function main() {
  // Ленивый импорт после config(): @/lib/scenario/generate тянет @/db транзитивно,
  // а ESM-импорты хойстятся выше config() → DATABASE_URL не успевает загрузиться.
  const { generateScenario } = await import('@/lib/scenario/generate')
  await mkdir(DIR, { recursive: true })
  let ok = 0
  let failed = 0
  for (const item of MATRIX) {
    try {
      const { content } = await generateScenario(item.input, { retrieve: async () => [] })
      const md = scenarioToMarkdown(content, {
        title: content.title,
        direction: item.input.direction,
        gradeRange: item.gradeRange,
        gradeMin: item.gradeMin,
        gradeMax: item.gradeMax,
      })
      await writeFile(join(DIR, item.file), md, 'utf8')
      ok += 1
      console.log(`written ${item.file} (${content.title})`)
    } catch (e) {
      // 2-Max иногда возвращает невалидный JSON — не валим весь батч, пропускаем элемент.
      failed += 1
      console.warn(`SKIP ${item.file}: ${(e as Error).message}`)
    }
  }
  console.log(`\nГотово: ${ok} ok, ${failed} пропущено. Проверь файлы перед ingest.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
