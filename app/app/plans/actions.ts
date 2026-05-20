'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { planTopics, workPlans } from '@/db/schema'
import { parseFile } from '@/lib/parse'
import { detectAndAnonymize } from '@/lib/pii'
import { parsePlanTopics } from '@/lib/plan/parse-topics'
import { redirect } from 'next/navigation'

export interface AnalyzeResult {
  error?: string
  ok?: {
    filename: string
    original: string
    anonymized: string
    replacements: Array<{ type: string; original: string; placeholder: string }>
  }
}

export async function analyzePlanAction(
  _prev: AnalyzeResult,
  formData: FormData,
): Promise<AnalyzeResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Выберите файл плана.' }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await parseFile({ buffer, filename: file.name, mimeType: file.type })
    if (!text || text.length < 10) return { error: 'Не удалось извлечь текст из файла.' }
    const report = detectAndAnonymize(text)
    return {
      ok: {
        filename: file.name,
        original: report.original,
        anonymized: report.anonymized,
        replacements: report.replacements,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ошибка обработки файла.' }
  }
}

export interface SaveResult {
  error?: string
}

export async function savePlanAction(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const filename = String(formData.get('filename') ?? '')
  const useOriginal = formData.get('useOriginal') === 'on'
  const originalText = String(formData.get('originalText') ?? '')

  // Согласие на отправку необезличенных данных — только при явном чекбоксе.
  if (useOriginal && formData.get('consent') !== 'on') {
    return { error: 'Для сохранения без обезличивания подтвердите согласие.' }
  }

  // Пересчитываем обезличивание на сервере — не доверяем клиентским полям.
  const report = detectAndAnonymize(originalText)
  const text = useOriginal ? originalText : report.anonymized
  const piiFoundCount = report.replacements.length
  if (!text || text.length < 10) return { error: 'Пустой текст плана.' }

  const topics = parsePlanTopics(text)
  if (topics.length === 0) return { error: 'Не удалось выделить ни одной темы из плана.' }

  const title = filename.replace(/\.[^.]+$/, '') || 'План воспитательной работы'

  const [plan] = await db
    .insert(workPlans)
    .values({
      userId,
      title,
      originalFilename: filename || null,
      rawText: text,
      anonymized: !useOriginal,
      piiFoundCount,
    })
    .returning({ id: workPlans.id })
  const planId = plan.id

  await db.insert(planTopics).values(
    topics.map((t) => ({
      workPlanId: planId,
      userId,
      title: t.title,
      plannedDate: t.plannedDate,
      orderIdx: t.orderIdx,
    })),
  )

  redirect(`/app/plans/${planId}`)
}
