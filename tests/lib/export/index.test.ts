import { isExportFormat, renderScenarioExport } from '@/lib/export'
import type { ExportMeta } from '@/lib/export/document-model'
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
  goals: ['Цель'],
  materials: [],
  stages: [
    {
      kind: 'engage',
      title: 'Этап',
      duration_min: 40,
      activities: [{ type: 'task', text: 'Текст' }],
    },
  ],
  adaptations: { simpler: 'A', harder: 'B' },
}

describe('isExportFormat', () => {
  it('принимает pdf и docx, отвергает остальное', () => {
    expect(isExportFormat('pdf')).toBe(true)
    expect(isExportFormat('docx')).toBe(true)
    expect(isExportFormat('txt')).toBe(false)
    expect(isExportFormat(null)).toBe(false)
  })
})

describe('renderScenarioExport', () => {
  it('pdf → application/pdf, непустое тело', async () => {
    const out = await renderScenarioExport('pdf', content, meta)
    expect(out.contentType).toBe('application/pdf')
    expect(out.body.length).toBeGreaterThan(0)
    expect(out.ext).toBe('pdf')
  })

  it('docx → wordprocessingml content-type, непустое тело', async () => {
    const out = await renderScenarioExport('docx', content, meta)
    expect(out.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(out.body.length).toBeGreaterThan(0)
    expect(out.ext).toBe('docx')
  })
})
