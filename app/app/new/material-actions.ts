'use server'

import { auth } from '@/auth'
import { parseFile } from '@/lib/parse'
import { detectAndAnonymize } from '@/lib/pii'
import { checkRateLimit } from '@/lib/ratelimit'
import { redirect } from 'next/navigation'

export interface AnalyzeMaterialResult {
  error?: string
  ok?: {
    filename: string
    original: string
    anonymized: string
    replacements: Array<{ type: string; original: string; placeholder: string }>
  }
}

export async function analyzeMaterialAction(
  _prev: AnalyzeMaterialResult,
  formData: FormData,
): Promise<AnalyzeMaterialResult> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const rl = await checkRateLimit({
    key: 'material',
    subject: session.user.id,
    email: session.user.email,
    limit: Number(process.env.MAX_MATERIAL_PER_DAY ?? '20'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) return { error: 'Превышен дневной лимит загрузок материала. Попробуйте завтра.' }

  const file = formData.get('material')
  if (!(file instanceof File) || file.size === 0) return { error: 'Выберите файл материала.' }

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
