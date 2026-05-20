import { detectNames } from '@/lib/pii/names'
import { describe, expect, it } from 'vitest'

const vals = (t: string) => detectNames(t).map((m) => m.value)

describe('detectNames', () => {
  it('детектит ФИО с отчеством (Фамилия Имя Отчество)', () => {
    const m = detectNames('классный руководитель Иванова Мария Петровна провела')
    expect(m.some((x) => x.value.includes('Мария Петровна'))).toBe(true)
  })

  it('детектит Имя + Фамилия по словарю имён и суффиксу фамилии', () => {
    expect(vals('ученик Пётр Сидоров получил')).toContain('Пётр Сидоров')
  })

  it('детектит одиночное распространённое имя', () => {
    expect(vals('сегодня Анна рассказала')).toContain('Анна')
  })

  it('не детектит обычные слова с заглавной в начале предложения', () => {
    expect(detectNames('Урок прошёл хорошо. Дети активно работали.')).toHaveLength(0)
  })

  it('возвращает корректные start/end', () => {
    const text = 'позвал Анна сюда'
    // biome-ignore lint/style/noNonNullAssertion: name guaranteed present in this fixture
    const m = detectNames(text).find((x) => x.value === 'Анна')!
    expect(text.slice(m.start, m.end)).toBe('Анна')
  })
})
