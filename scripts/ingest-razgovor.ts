import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { embed } from '@/lib/gigachat/embeddings'
import { ingestDocument } from '@/lib/rag/ingest'
import { drizzleIngestDb } from '@/lib/rag/ingest-db'
import pdf from 'pdf-parse'

const BASE = process.env.RAZGOVOR_BASE ?? 'https://разговорыоважном.рф'
const SITEMAP = `${BASE}/sitemap.xml`
const LANG = process.env.PG_TSV_LANG ?? 'russian'
const DELAY_MS = Number(process.env.RAZGOVOR_DELAY_MS ?? '1500')
const MAX_DATES = Number(process.env.RAZGOVOR_MAX_DATES ?? '8')
const WANTED_VARIANTS = ['1s', '2m']

const GRADE_MAP: Record<string, { min: number; max: number }> = {
  '1-2': { min: 1, max: 2 },
  '3-4': { min: 3, max: 4 },
  '5-7': { min: 5, max: 7 },
  '8-9': { min: 8, max: 9 },
  '10-11': { min: 10, max: 11 },
  SPO: { min: 10, max: 11 },
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'KlassniyChas-RAG-ingest/1.0' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

function extractUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

function extractPdfLinks(html: string, dateUrl: string): string[] {
  const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1])
  const abs = links.map((l) => (l.startsWith('http') ? l : new URL(l, dateUrl).toString()))
  return abs.filter((u) => {
    const parts = decodeURIComponent(u).split('/')
    const variant = parts[parts.length - 2]
    const grade = parts[parts.length - 3]
    return WANTED_VARIANTS.includes(variant) && GRADE_MAP[grade] !== undefined
  })
}

function parseUrlMeta(u: string): { gradeRange: string; variant: string } {
  const parts = decodeURIComponent(u).split('/')
  return { gradeRange: parts[parts.length - 3], variant: parts[parts.length - 2] }
}

async function main() {
  const sitemap = await fetchText(SITEMAP)
  const dateUrls = extractUrls(sitemap)
    .filter((u) => /\/\d{2}-\d{2}-\d{4}\/?$/.test(u))
    .slice(0, MAX_DATES)

  let totalInserted = 0
  for (const dateUrl of dateUrls) {
    let html: string
    try {
      html = await fetchText(dateUrl)
    } catch (e) {
      console.warn(`skip date ${dateUrl}: ${e}`)
      await sleep(DELAY_MS)
      continue
    }
    const pdfs = extractPdfLinks(html, dateUrl)
    for (const pdfUrl of pdfs) {
      try {
        const res = await fetch(pdfUrl, {
          headers: { 'User-Agent': 'KlassniyChas-RAG-ingest/1.0' },
        })
        if (!res.ok) throw new Error(`${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const parsed = await pdf(buf)
        const text = parsed.text?.trim()
        if (!text || text.length < 200) {
          console.warn(`skip empty pdf ${pdfUrl}`)
          await sleep(DELAY_MS)
          continue
        }
        const { gradeRange, variant } = parseUrlMeta(pdfUrl)
        const grade = GRADE_MAP[gradeRange]
        const r = await ingestDocument(
          {
            source: 'razgovor',
            title: `Разговоры о важном — ${gradeRange} (${variant}) — ${pdfUrl.split('/').pop()}`,
            direction: null,
            gradeRange,
            gradeMin: grade.min,
            gradeMax: grade.max,
            rawUrl: pdfUrl,
            text,
            lang: LANG,
          },
          { embed, db: drizzleIngestDb },
        )
        totalInserted += r.inserted
        console.log(`${pdfUrl}: +${r.inserted} chunks, skipped ${r.skipped}`)
      } catch (e) {
        console.warn(`skip pdf ${pdfUrl}: ${e}`)
      }
      await sleep(DELAY_MS)
    }
    await sleep(DELAY_MS)
  }
  console.log(`\nИтого вставлено: ${totalInserted}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
