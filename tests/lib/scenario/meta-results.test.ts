import {
  type MetaCatalog,
  buildMetaCatalogSection,
  getMetaCatalog,
  selectMetaResults,
} from '@/lib/scenario/meta-results'
import { describe, expect, it } from 'vitest'

const catalog: MetaCatalog = {
  cognitive: ['Сравнивать объекты, устанавливать аналогии', 'Находить закономерности'],
  communicative: [
    'Воспринимать и формулировать суждения',
    'Признавать возможность разных точек зрения',
  ],
  regulatory: ['Планировать действия по решению учебной задачи'],
}

describe('selectMetaResults', () => {
  it('пустой input → добирает min по 1 из каждой группы', () => {
    const r = selectMetaResults(undefined, catalog)
    expect(r.cognitive.length).toBeGreaterThanOrEqual(1)
    expect(r.communicative.length).toBeGreaterThanOrEqual(1)
    expect(r.regulatory.length).toBeGreaterThanOrEqual(1)
  })

  it('валидные строки сохраняются', () => {
    const input = { cognitive: ['Сравнивать объекты, устанавливать аналогии'] }
    const r = selectMetaResults(input, catalog)
    expect(r.cognitive).toContain('Сравнивать объекты, устанавливать аналогии')
  })

  it('невалидные строки отфильтровываются и добирается из каталога', () => {
    const input = { cognitive: ['Выдуманная формулировка LLM'], communicative: [], regulatory: [] }
    const r = selectMetaResults(input, catalog)
    expect(r.cognitive).not.toContain('Выдуманная формулировка LLM')
    expect(r.cognitive.length).toBeGreaterThanOrEqual(1)
  })

  it('обрезает до 3 на группу', () => {
    const big = { cognitive: [...catalog.cognitive, 'X', 'Y'] }
    const r = selectMetaResults(big, catalog)
    expect(r.cognitive.length).toBeLessThanOrEqual(3)
  })

  it('пробелы нормализуются при сравнении', () => {
    const input = { cognitive: ['Сравнивать  объекты,  устанавливать аналогии'] }
    const r = selectMetaResults(input, catalog)
    expect(r.cognitive).toContain('Сравнивать объекты, устанавливать аналогии')
  })

  it('buildMetaCatalogSection возвращает непустой массив строк', () => {
    const lines = buildMetaCatalogSection(catalog)
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.some((l) => l.includes('Познавательные'))).toBe(true)
    expect(lines.some((l) => l.includes('Коммуникативные'))).toBe(true)
    expect(lines.some((l) => l.includes('Регулятивные'))).toBe(true)
  })

  it('getMetaCatalog возвращает каталог по уровню', () => {
    expect(getMetaCatalog('NOO').cognitive.length).toBeGreaterThan(0)
    expect(getMetaCatalog('OOO').communicative.length).toBeGreaterThan(0)
    expect(getMetaCatalog('SOO').regulatory.length).toBeGreaterThan(0)
  })
})
