import type { Direction, Format } from '@/lib/scenario/options'

export type CalendarOccasion = {
  date: string // MM-DD
  title: string
  suggested_direction: Direction
  suggested_formats: Format[]
}

export const CALENDAR_EVENTS: CalendarOccasion[] = [
  {
    date: '09-01',
    title: 'День знаний',
    suggested_direction: 'Познавательное',
    suggested_formats: ['классный час', 'беседа'],
  },
  {
    date: '09-03',
    title: 'День солидарности в борьбе с терроризмом',
    suggested_direction: 'Гражданское',
    suggested_formats: ['беседа', 'классный час'],
  },
  {
    date: '10-05',
    title: 'День учителя',
    suggested_direction: 'Духовно-нравственное',
    suggested_formats: ['классный час', 'мастерская'],
  },
  {
    date: '10-16',
    title: 'Всероссийский урок «Экология и энергосбережение»',
    suggested_direction: 'Экологическое',
    suggested_formats: ['квиз', 'беседа'],
  },
  {
    date: '11-04',
    title: 'День народного единства',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['классный час', 'игра'],
  },
  {
    date: '11-16',
    title: 'Международный день толерантности',
    suggested_direction: 'Духовно-нравственное',
    suggested_formats: ['беседа', 'игра'],
  },
  {
    date: '11-26',
    title: 'День матери в России',
    suggested_direction: 'Духовно-нравственное',
    suggested_formats: ['классный час', 'мастерская'],
  },
  {
    date: '12-03',
    title: 'День неизвестного солдата',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['беседа', 'классный час'],
  },
  {
    date: '12-09',
    title: 'День Героев Отечества',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['классный час', 'беседа'],
  },
  {
    date: '12-12',
    title: 'День Конституции РФ',
    suggested_direction: 'Гражданское',
    suggested_formats: ['квиз', 'беседа'],
  },
  {
    date: '01-27',
    title: 'День снятия блокады Ленинграда',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['беседа', 'классный час'],
  },
  {
    date: '02-08',
    title: 'День российской науки',
    suggested_direction: 'Познавательное',
    suggested_formats: ['квиз', 'мастерская'],
  },
  {
    date: '02-23',
    title: 'День защитника Отечества',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['игра', 'классный час'],
  },
  {
    date: '03-08',
    title: 'Международный женский день',
    suggested_direction: 'Эстетическое',
    suggested_formats: ['мастерская', 'классный час'],
  },
  {
    date: '03-18',
    title: 'День воссоединения Крыма с Россией',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['беседа', 'классный час'],
  },
  {
    date: '04-07',
    title: 'Всемирный день здоровья',
    suggested_direction: 'Физическое и здоровье',
    suggested_formats: ['игра', 'беседа'],
  },
  {
    date: '04-12',
    title: 'День космонавтики',
    suggested_direction: 'Познавательное',
    suggested_formats: ['квиз', 'игра'],
  },
  {
    date: '04-22',
    title: 'Международный день Земли',
    suggested_direction: 'Экологическое',
    suggested_formats: ['мастерская', 'беседа'],
  },
  {
    date: '05-01',
    title: 'Праздник Весны и Труда',
    suggested_direction: 'Трудовое',
    suggested_formats: ['беседа', 'мастерская'],
  },
  {
    date: '05-09',
    title: 'День Победы',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['классный час', 'беседа'],
  },
  {
    date: '05-24',
    title: 'День славянской письменности и культуры',
    suggested_direction: 'Эстетическое',
    suggested_formats: ['беседа', 'квиз'],
  },
  {
    date: '06-01',
    title: 'Международный день защиты детей',
    suggested_direction: 'Гражданское',
    suggested_formats: ['игра', 'мастерская'],
  },
  {
    date: '06-12',
    title: 'День России',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['классный час', 'квиз'],
  },
  {
    date: '06-22',
    title: 'День памяти и скорби',
    suggested_direction: 'Патриотическое',
    suggested_formats: ['беседа', 'классный час'],
  },
  {
    date: '10-30',
    title: 'Всероссийский урок безопасности в сети Интернет',
    suggested_direction: 'Познавательное',
    suggested_formats: ['беседа', 'квиз'],
  },
]
