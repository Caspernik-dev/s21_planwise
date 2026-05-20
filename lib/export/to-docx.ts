import type { ScenarioContent } from '@/lib/scenario/schema'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { type ExportMeta, buildScenarioDocument } from './document-model'

const FONT = 'Times New Roman'

export function buildScenarioDocx(content: ScenarioContent, meta: ExportMeta): Document {
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
    }
  }

  return new Document({ sections: [{ children }] })
}

export async function renderScenarioDocx(
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<Buffer> {
  return Packer.toBuffer(buildScenarioDocx(content, meta))
}
