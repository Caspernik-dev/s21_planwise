'use server'

import { auth } from '@/auth'
import { prematchShared } from '@/lib/community/prematch'
import { generationInputSchema } from '@/lib/scenario/schema'

export type PrematchCard = {
  id: string
  title: string
  direction: string
  format: string
  likeCount: number
  stages: Array<{ title: string }>
}

export async function prematchAction(formData: FormData): Promise<PrematchCard[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const parsed = generationInputSchema.safeParse({
    direction: formData.get('direction'),
    grade: formData.get('grade'),
    topic: formData.get('topic'),
    durationMin: formData.get('durationMin'),
    format: formData.get('format'),
  })
  if (!parsed.success) return []
  const i = parsed.data
  try {
    const matches = await prematchShared({
      direction: i.direction,
      grade: i.grade,
      topic: i.topic,
      format: i.format,
    })
    return matches.map((m) => ({
      id: m.id,
      title: m.title,
      direction: m.direction,
      format: m.format,
      likeCount: m.likeCount,
      stages: ((m.anonymizedContent as { stages?: Array<{ title: string }> }).stages ?? []).map(
        (s) => ({ title: s.title }),
      ),
    }))
  } catch (e) {
    console.error('prematchAction failed (non-fatal):', e)
    return []
  }
}
