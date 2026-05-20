import { parsePartialJson } from '@/lib/scenario/partial'
import { describe, expect, it } from 'vitest'

describe('parsePartialJson', () => {
  it('парсит полный объект', () => {
    expect(parsePartialJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('закрывает оборванную строку', () => {
    expect(parsePartialJson('{"title":"Дру')).toEqual({ title: 'Дру' })
  })

  it('закрывает оборванный массив и объект', () => {
    expect(parsePartialJson('{"goals":["a","b"')).toEqual({ goals: ['a', 'b'] })
  })

  it('закрывает вложенные этапы', () => {
    expect(parsePartialJson('{"stages":[{"title":"X","duration_min":5},{"title":"Y"')).toEqual({
      stages: [{ title: 'X', duration_min: 5 }, { title: 'Y' }],
    })
  })

  it('срезает висячую запятую', () => {
    expect(parsePartialJson('{"a":1,')).toEqual({ a: 1 })
  })

  it('подставляет null после висячего двоеточия', () => {
    expect(parsePartialJson('{"a":')).toEqual({ a: null })
  })

  it('снимает markdown-обёртку', () => {
    expect(parsePartialJson('```json\n{"a":1}')).toEqual({ a: 1 })
  })

  it('возвращает null если нет объекта', () => {
    expect(parsePartialJson('просто текст')).toBeNull()
  })
})
