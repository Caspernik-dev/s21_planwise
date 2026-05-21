import type { ScenarioContent } from '@/lib/scenario/schema'

export function scenarioContentToText(content: ScenarioContent): string {
  const parts: string[] = [
    content.title,
    ...content.goals,
    ...(content.values ?? []),
    ...(content.coreMeanings ?? []),
    ...content.materials,
  ]
  for (const stage of content.stages) {
    parts.push(stage.title)
    for (const a of stage.activities) {
      parts.push(a.text)
      if (a.questions) parts.push(...a.questions)
    }
  }
  parts.push(content.adaptations.simpler, content.adaptations.harder)
  return parts.join('\n')
}

export function mapContentStrings(
  content: ScenarioContent,
  fn: (s: string) => string,
): ScenarioContent {
  return {
    title: fn(content.title),
    goals: content.goals.map(fn),
    values: content.values ? content.values.map(fn) : content.values,
    coreMeanings: content.coreMeanings ? content.coreMeanings.map(fn) : content.coreMeanings,
    materials: content.materials.map(fn),
    stages: content.stages.map((stage) => ({
      ...stage,
      title: fn(stage.title),
      activities: stage.activities.map((a) => ({
        ...a,
        text: fn(a.text),
        questions: a.questions ? a.questions.map(fn) : a.questions,
      })),
    })),
    adaptations: {
      simpler: fn(content.adaptations.simpler),
      harder: fn(content.adaptations.harder),
    },
  }
}
