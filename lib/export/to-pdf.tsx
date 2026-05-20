import path from 'node:path'
import type { ScenarioContent } from '@/lib/scenario/schema'
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { type DocBlock, type ExportMeta, buildScenarioDocument } from './document-model'

let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const dir = path.join(process.cwd(), 'assets', 'fonts')
  Font.register({
    family: 'PT Sans',
    fonts: [
      { src: path.join(dir, 'PTSans-Regular.ttf') },
      { src: path.join(dir, 'PTSans-Bold.ttf'), fontWeight: 'bold' },
    ],
  })
  fontsRegistered = true
}

const styles = StyleSheet.create({
  page: { fontFamily: 'PT Sans', fontSize: 11, padding: 48, lineHeight: 1.4, color: '#1a1a1a' },
  h1: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  h2: { fontSize: 13, fontWeight: 'bold', marginTop: 14, marginBottom: 6 },
  p: { marginBottom: 6 },
  bulletRow: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 12 },
  bulletText: { flex: 1 },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { fontWeight: 'bold', width: 110 },
  metaValue: { flex: 1 },
  metaTable: { marginBottom: 10 },
})

function renderBlock(b: DocBlock, i: number) {
  switch (b.type) {
    case 'heading':
      return (
        <Text key={i} style={b.level === 1 ? styles.h1 : styles.h2}>
          {b.text}
        </Text>
      )
    case 'paragraph':
      return (
        <Text key={i} style={styles.p}>
          {b.text}
        </Text>
      )
    case 'bullets':
      return (
        <View key={i}>
          {b.items.map((it, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list, index is safe
            <View key={j} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{it}</Text>
            </View>
          ))}
        </View>
      )
    case 'metaTable':
      return (
        <View key={i} style={styles.metaTable}>
          {b.rows.map((r, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list, index is safe
            <View key={j} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{r.label}</Text>
              <Text style={styles.metaValue}>{r.value}</Text>
            </View>
          ))}
        </View>
      )
  }
}

export function ScenarioPdf({ content, meta }: { content: ScenarioContent; meta: ExportMeta }) {
  const blocks = buildScenarioDocument(content, meta)
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {blocks.map(renderBlock)}
      </Page>
    </Document>
  )
}

export async function renderScenarioPdf(
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(<ScenarioPdf content={content} meta={meta} />)
}
