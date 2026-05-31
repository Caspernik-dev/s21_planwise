import type { ScenarioContent } from '@/lib/scenario/schema'
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { type ExportMeta, buildScenarioDocument } from './document-model'
import { renderQrDataUrl } from './qr'

const FONT = 'Times New Roman'

export function buildScenarioDocx(
  content: ScenarioContent,
  meta: ExportMeta,
  qrByUrl: Map<string, Buffer> = new Map(),
): Document {
  const blocks = buildScenarioDocument(content, meta)
  const children: Paragraph[] = []

  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
        children.push(
          new Paragraph({
            heading: b.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            children: [new TextRun({ text: b.text, bold: true, font: FONT })],
          }),
        )
        break
      case 'paragraph':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, font: FONT })] }))
        break
      case 'bullets':
        for (const item of b.items) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: item, font: FONT })],
            }),
          )
        }
        break
      case 'metaTable':
        for (const row of b.rows) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${row.label}: `, bold: true, font: FONT }),
                new TextRun({ text: row.value, font: FONT }),
              ],
            }),
          )
        }
        break
      case 'videoLink': {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [
              new TextRun({ text: '🔍 Поиск на RuTube: ', bold: true, font: FONT }),
              new TextRun({ text: b.query, font: FONT }),
            ],
          }),
        )
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new ExternalHyperlink({
                link: b.url,
                children: [new TextRun({ text: b.url, style: 'Hyperlink', font: FONT })],
              }),
            ],
          }),
        )
        const qr = qrByUrl.get(b.url)
        if (qr) {
          children.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [
                new ImageRun({
                  data: qr,
                  transformation: { width: 120, height: 120 },
                  type: 'png',
                }),
              ],
            }),
          )
        }
        break
      }
    }
  }

  return new Document({ sections: [{ children }] })
}

export async function renderScenarioDocx(
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<Buffer> {
  const allBlocks = buildScenarioDocument(content, meta)
  const qrByUrl = new Map<string, Buffer>()
  for (const b of allBlocks) {
    if (b.type === 'videoLink' && !qrByUrl.has(b.url)) {
      const dataUrl = await renderQrDataUrl(b.url, 160)
      const base64 = dataUrl.split(',')[1]
      qrByUrl.set(b.url, Buffer.from(base64, 'base64'))
    }
  }
  return Packer.toBuffer(buildScenarioDocx(content, meta, qrByUrl))
}
