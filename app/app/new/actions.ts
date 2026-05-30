'use server'

import { auth } from '@/auth'
import { prematchShared } from '@/lib/community/prematch'
import { checkRateLimit } from '@/lib/ratelimit'
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
  const rl = await checkRateLimit({
    key: 'prematch',
    subject: session.user.id,
    email: session.user.email,
    limit: Number(process.env.MAX_PREMATCH_PER_DAY ?? '60'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) return []
  const parsed = generationInputSchema.safeParse({
    // TODO(Task 16): read lessonType from form once UI sends it; defaulting to 'rov' for prematch
    lessonType: formData.get('lessonType') ?? 'rov',
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
      direction: i.direction ?? '',
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
