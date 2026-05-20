import { auth } from '@/auth'
import { db } from '@/db'
import { generations, planTopics, scenarioVersions, scenarios } from '@/db/schema'
import { generationInputSchema } from '@/lib/scenario/schema'
import type { GenerationMeta, ScenarioContent } from '@/lib/scenario/schema'
import { streamScenario } from '@/lib/scenario/stream'
import { and, eq, sql } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const parsed = generationInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Проверьте параметры формы' }, { status: 400 })
  }
  const input = parsed.data

  let sourcePlanTopicId: string | null = null
  const rawTopicId = (body as { planTopicId?: unknown })?.planTopicId
  if (typeof rawTopicId === 'string' && rawTopicId.length > 0) {
    const [t] = await db
      .select({ id: planTopics.id })
      .from(planTopics)
      .where(and(eq(planTopics.id, rawTopicId), eq(planTopics.userId, userId)))
      .limit(1)
    if (t) sourcePlanTopicId = t.id
  }

  const save = async (content: ScenarioContent, meta: GenerationMeta): Promise<string> => {
    const [row] = await db
      .insert(scenarios)
      .values({
        userId,
        title: content.title,
        direction: input.direction,
        grade: input.grade,
        durationMin: input.durationMin,
        format: input.format,
        topic: input.topic,
        sourcePlanTopicId,
        content,
        inputContext: input,
        generationMeta: meta,
      })
      .returning({ id: scenarios.id })
    const scenarioId = row.id
    await db.insert(scenarioVersions).values({ scenarioId, content })
    await db.insert(generations).values({
      userId,
      scenarioId,
      promptTokens: meta.usage?.promptTokens ?? null,
      completionTokens: meta.usage?.completionTokens ?? null,
      latencyMs: meta.latencyMs,
      status: 'ok',
    })
    try {
      const { embed } = await import('@/lib/gigachat/embeddings')
      const [vec] = await embed([`${input.direction} ${input.topic} ${content.title}`])
      await db.execute(
        sql`UPDATE scenarios SET embedding = ${`[${vec.join(',')}]`}::vector WHERE id = ${scenarioId}`,
      )
    } catch (e) {
      console.error('scenario embedding failed (non-fatal):', e)
    }
    return scenarioId
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let sawError = false
      try {
        for await (const ev of streamScenario(input, { save })) {
          if (ev.type === 'error') sawError = true
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
        }
      } catch (e) {
        console.error('generate stream crashed:', e)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'Ошибка генерации.' })}\n\n`,
          ),
        )
        sawError = true
      } finally {
        if (sawError) {
          await db
            .insert(generations)
            .values({ userId, scenarioId: null, latencyMs: null, status: 'error' })
            .catch(() => {})
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
