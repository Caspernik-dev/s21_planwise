import type { ScenarioContent } from './schema'

export type SeedMeta = {
  title: string
  direction: string
  gradeRange: string
  gradeMin: number
  gradeMax: number
}

export function scenarioToMarkdown(content: ScenarioContent, meta: SeedMeta): string {
  const fm = [
    '---',
    `title: ${meta.title}`,
    `direction: ${meta.direction}`,
    `grade_range: ${meta.gradeRange}`,
    `grade_min: ${meta.gradeMin}`,
    `grade_max: ${meta.gradeMax}`,
    '---',
    '',
  ]

  const body: string[] = []
  body.push('## Цель', '', content.goals.map((g) => `- ${g}`).join('\n'), '')

  content.stages.forEach((stage, i) => {
    const isReflection = stage.kind === 'reflection'
    const heading = isReflection ? '## Рефлексия' : `## Ход занятия. Этап ${i + 1}. ${stage.title}`
    body.push(heading, '')
    for (const act of stage.activities) {
      body.push(act.text)
      if (act.questions?.length) {
        body.push('', `Вопросы: ${act.questions.join(' ')}`)
      }
      body.push('')
    }
  })

  body.push('## Материалы', '', content.materials.map((m) => `- ${m}`).join('\n'), '')
  body.push(
    '## Адаптация',
    '',
    `Проще: ${content.adaptations.simpler}`,
    '',
    `Сложнее: ${content.adaptations.harder}`,
    '',
  )

  return fm.join('\n') + body.join('\n')
}
