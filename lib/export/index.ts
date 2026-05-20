import type { ScenarioContent } from '@/lib/scenario/schema'
import type { ExportMeta } from './document-model'
import { renderScenarioDocx } from './to-docx'
import { renderScenarioPdf } from './to-pdf'

export type ExportFormat = 'pdf' | 'docx'

export function isExportFormat(v: string | null): v is ExportFormat {
  return v === 'pdf' || v === 'docx'
}

const CONTENT_TYPE: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function renderScenarioExport(
  format: ExportFormat,
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<{ body: Buffer; contentType: string; ext: ExportFormat }> {
  const body =
    format === 'pdf'
      ? await renderScenarioPdf(content, meta)
      : await renderScenarioDocx(content, meta)
  return { body, contentType: CONTENT_TYPE[format], ext: format }
}
