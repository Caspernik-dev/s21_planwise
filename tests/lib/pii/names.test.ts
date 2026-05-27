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
  it('детектит имя и фамилию в косвенном падеже', () => {
    expect(vals('для Анны Ивановой подготовили карточку')).toContain('Анны Ивановой')
  })
  
  it('детектит полное ФИО в косвенном падеже', () => {
    const m = detectNames('для Ивановой Марии Петровны подготовили материалы')
    expect(m.some((x) => x.value.includes('Марии Петровны'))).toBe(true)
  })
  it('check на ложные срабатывания', () => {
    expect(vals('для Анны карточка')).toEqual(['Анны'])
    expect(vals('товар Ивановой марки')).toEqual([])
    expect(vals('Компания Ивановой вышла на рынок')).toEqual([])
  })

  it('не редактит одиночное имя-омоним (слово-ценность)', () => {
    expect(vals('Любовь к Родине — основа патриотизма')).toEqual([])
    expect(vals('Вера в себя помогает преодолевать трудности')).toEqual([])
    expect(vals('Надежда умирает последней')).toEqual([])
    expect(vals('Роман Толстого «Война и мир»')).toEqual([])
  })

  it('не редактит косвенную форму имени-омонима одиночно', () => {
    expect(vals('Веру и надежду нельзя терять')).toEqual([])
    expect(vals('с Любовью и заботой относиться к ближнему')).toEqual([])
  })

  it('детектит имя-омоним в сильном контексте (с фамилией/отчеством)', () => {
    expect(vals('Вера Иванова провела урок')).toContain('Вера Иванова')
    expect(vals('для Веры Ивановой подготовили карточку')).toContain('Веры Ивановой')
    expect(vals('Льва Николаевича Толстого читали')).toContain('Льва Николаевича')
    expect(vals('для Любови Петровны материалы')).toContain('Любови Петровны')
  })

  it('не-омонимичные имена детектятся одиночно как прежде', () => {
    expect(vals('Анна подготовила классный час о дружбе')).toContain('Анна')
    expect(vals('Звонок Петру был важен')).toContain('Петру')
  })
})
