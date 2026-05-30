export const DIRECTIONS = [
  'Гражданское',
  'Патриотическое',
  'Духовно-нравственное',
  'Эстетическое',
  'Физическое и здоровье',
  'Трудовое',
  'Экологическое',
  'Познавательное',
  'Адаптация к изменяющимся условиям',
  'Семейные ценности',
  'Профориентация',
  'Здоровый образ жизни',
] as const

export const FORMATS = [
  'классный час',
  'беседа',
  'квиз',
  'игра',
  'мастерская',
  'киноклуб',
  'дебаты',
  'проектная сессия',
  'мастер-класс',
  'творческая мастерская',
  'практикум',
  'кейс-сессия',
  'лабораторная',
  'эксперимент',
  'проект',
  'олимпиадный тренинг',
  'праздник',
  'тематический день',
  'КТД',
] as const

export const DURATIONS = [20, 30, 40, 45, 60, 90] as const

export const SPO_GRADE = 12

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, SPO_GRADE] as const

export function formatGrade(grade: number): string {
  return grade === SPO_GRADE ? 'СПО' : `${grade} класс`
}

export function formatGradeForPrompt(grade: number): string {
  return grade === SPO_GRADE
    ? 'обучающиеся СПО (среднее профессиональное образование)'
    : `${grade} класс`
}

export type Direction = (typeof DIRECTIONS)[number]
export type Format = (typeof FORMATS)[number]

export const LESSON_TYPES = [
  {
    value: 'rov' as const,
    label: 'Разговоры о важном',
    description: 'Федеральный курс, понедельник 1-й урок. Трёхчастная структура с видеовходом.',
    icon: 'flag' as const,
    federal: true,
  },
  {
    value: 'krujok' as const,
    label: 'Тематический кружок',
    description: 'Занятие по интересам: робототехника, театр, шахматы. Свободная форма.',
    icon: 'sparkles' as const,
    federal: false,
  },
  {
    value: 'literacy' as const,
    label: 'Функциональная грамотность',
    description:
      'Жизненный кейс → разбор → перенос. Читательская/математическая/финансовая/естественнонаучная.',
    icon: 'brain' as const,
    federal: false,
  },
  {
    value: 'subject_extension' as const,
    label: 'Предметное углубление',
    description: 'Опыт, проект, лаборатория поверх школьного предмета.',
    icon: 'flask-conical' as const,
    federal: false,
  },
  {
    value: 'event' as const,
    label: 'Воспитательное мероприятие',
    description: 'Тематический классный час, праздник, КТД, тематический день.',
    icon: 'party-popper' as const,
    federal: false,
  },
] as const

export type LessonType = (typeof LESSON_TYPES)[number]['value']

export const LESSON_TYPE_VALUES: readonly LessonType[] = LESSON_TYPES.map((t) => t.value)

export function lessonTypeLabel(value: LessonType): string {
  return LESSON_TYPES.find((t) => t.value === value)?.label ?? value
}

export const LITERACY_KINDS = [
  { value: 'reading' as const, label: 'Читательская грамотность' },
  { value: 'math' as const, label: 'Математическая грамотность' },
  { value: 'financial' as const, label: 'Финансовая грамотность' },
  { value: 'science' as const, label: 'Естественнонаучная грамотность' },
] as const

export type LiteracyKind = (typeof LITERACY_KINDS)[number]['value']

export function literacyKindLabel(value: LiteracyKind): string {
  return LITERACY_KINDS.find((k) => k.value === value)?.label ?? value
}

export const FORMATS_BY_TYPE: Record<LessonType, readonly Format[]> = {
  rov: ['классный час', 'беседа', 'квиз', 'игра', 'киноклуб', 'дебаты'],
  krujok: ['мастер-класс', 'творческая мастерская', 'игра', 'мастерская', 'проектная сессия'],
  literacy: ['практикум', 'кейс-сессия', 'игра', 'квиз'],
  subject_extension: ['лабораторная', 'эксперимент', 'проект', 'олимпиадный тренинг'],
  event: ['классный час', 'праздник', 'тематический день', 'КТД', 'мастерская'],
}

export const DURATIONS_BY_TYPE: Record<LessonType, readonly number[]> = {
  rov: [20, 30, 40],
  krujok: [30, 40, 45, 60, 90],
  literacy: [40, 60, 90],
  subject_extension: [40, 60, 90],
  event: [30, 40, 45, 60],
}
