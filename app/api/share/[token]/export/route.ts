import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { logEvent } from '@/lib/events/log'
import { isExportFormat, renderScenarioExport } from '@/lib/export'
import { checkRateLimit } from '@/lib/ratelimit'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const rl = await checkRateLimit({
    key: 'share-export',
    subject: token,
    limit: Number(process.env.MAX_SHARE_EXPORT_PER_DAY ?? '200'),
    windowMs: 86_400_000,
  })
  if (!rl.allowed) return new Response('Слишком много запросов', { status: 429 })

  const format = req.nextUrl.searchParams.get('format')
  if (!isExportFormat(format)) return new Response('Unsupported format', { status: 400 })

  const [row] = await db.select().from(scenarios).where(eq(scenarios.shareToken, token)).limit(1)
  if (!row) return new Response('Not found', { status: 404 })

  const { body, contentType, ext } = await renderScenarioExport(format, row.content, {
    topic: row.topic,
    direction: row.direction,
    grade: row.grade,
    durationMin: row.durationMin,
    format: row.format,
  })

  await logEvent('export', { userId: null, meta: { format, via: 'share' } })

  const asciiName = `scenario-${row.id}.${ext}`
  const utf8Name = encodeURIComponent(`${row.content.title}.${ext}`).replace(
    /['*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Content-Length': String(body.length),
    },
  })
}
