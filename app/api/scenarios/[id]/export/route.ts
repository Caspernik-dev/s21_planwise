import { auth } from '@/auth'
import { db } from '@/db'
import { scenarios } from '@/db/schema'
import { isExportFormat, renderScenarioExport } from '@/lib/export'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

  const format = req.nextUrl.searchParams.get('format')
  if (!isExportFormat(format)) return new Response('Unsupported format', { status: 400 })

  const { id } = await params
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), eq(scenarios.userId, session.user.id)))
    .limit(1)
  if (!row) return new Response('Not found', { status: 404 })

  const { body, contentType, ext } = await renderScenarioExport(format, row.content, {
    topic: row.topic,
    direction: row.direction,
    grade: row.grade,
    durationMin: row.durationMin,
    format: row.format,
  })

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
