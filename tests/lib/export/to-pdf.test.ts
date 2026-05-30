import type { ExportMeta } from '@/lib/export/document-model'
import { renderScenarioPdf } from '@/lib/export/to-pdf'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { describe, expect, it } from 'vitest'

const meta: ExportMeta = {
  topic: 'О дружбе',
  direction: 'Патриотическое',
  grade: 3,
  durationMin: 40,
  format: 'Беседа',
  lessonType: 'rov',
}
const content: ScenarioContent = {
  title: 'Дружба',
  goals: ['Понять ценность дружбы'],
  materials: ['Карточки'],
  stages: [
    {
      kind: 'engage',
      title: 'Вовлечение',
      duration_min: 40,
      activities: [{ type: 'discussion', text: 'Что такое дружба?', questions: ['Есть друг?'] }],
    },
  ],
  adaptations: { simpler: 'Проще', harder: 'Сложнее' },
}

describe('renderScenarioPdf', () => {
  it('возвращает непустой PDF (сигнатура %PDF), шрифт регистрируется без ошибок', async () => {
    const buf = await renderScenarioPdf(content, meta)
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })
})
