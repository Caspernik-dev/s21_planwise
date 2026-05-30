import path from 'node:path'
import type { ScenarioContent } from '@/lib/scenario/schema'
import {
  Document,
  Font,
  G,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
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

// Палитра Planwise (design_example/tailwind.config.ts)
const c = {
  brand500: '#21A663',
  brand600: '#178550',
  brand700: '#12663e',
  brand800: '#0e4f30',
  brand50: '#edfbf4',
  brand100: '#d0f5e3',
  warm400: '#f5b800',
  neutral800: '#272a24',
  neutral700: '#3d4039',
  neutral500: '#717670',
  neutral200: '#e4e6e1',
} as const

const DISCLAIMER_PREFIX = 'Сценарий сгенерирован ИИ'
// Промо-блок — заранее запечённый PNG (текст + QR), а не живой react-pdf-текст:
// субсеттинг шрифта в v4 нестабильно роняет глифы в составных документах
// («Planwise»→«anwise»). Картинка от этого иммунна. Генерится pnpm gen:promo.
const PROMO_PATH = path.join(process.cwd(), 'assets', 'promo-card.png')
// Исходный PNG 1000×232 (ratio 0.232). Ширина = контентная ширина A4 (595.28−2·48).
const PROMO_W = 499
const PROMO_H = Math.round(PROMO_W * (232 / 1000))

const styles = StyleSheet.create({
  // ВАЖНО: lineHeight НЕ задаём на Page — page-level lineHeight в
  // @react-pdf/renderer v4 ломает отрисовку fixed-absolute футера (исчезает).
  // Межстрочный интервал навешиваем на текстовые блоки тела по отдельности.
  page: {
    fontFamily: 'PT Sans',
    fontSize: 11,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 48,
    color: c.neutral700,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: c.brand100,
  },
  headerText: { marginLeft: 10 },
  wordmark: { fontSize: 16, fontWeight: 'bold', color: c.brand700, lineHeight: 1.1 },
  tagline: { fontSize: 9, color: c.neutral500 },
  h1: { fontSize: 21, fontWeight: 'bold', color: c.brand800, marginBottom: 12 },
  h2Row: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 7 },
  h2Bar: { width: 3, height: 13, backgroundColor: c.brand500, borderRadius: 2, marginRight: 7 },
  h2: { fontSize: 13, fontWeight: 'bold', color: c.brand700 },
  p: { marginBottom: 6, lineHeight: 1.25 },
  bulletRow: { flexDirection: 'row', marginBottom: 4 },
  bulletDot: { width: 12, color: c.brand500, fontWeight: 'bold' },
  bulletText: { flex: 1, lineHeight: 1.25 },
  metaCard: {
    backgroundColor: c.brand50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.brand100,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  metaRow: { flexDirection: 'row', marginBottom: 3 },
  metaLabel: { fontWeight: 'bold', width: 110, color: c.brand700, lineHeight: 1.4 },
  metaValue: { flex: 1, color: c.neutral800, lineHeight: 1.4 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.neutral200,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  footerText: { flex: 1, fontSize: 8, color: c.neutral500, lineHeight: 1.4 },
  footerPage: { fontSize: 8, color: c.neutral500, marginLeft: 12 },
  // Поток: только для замера, влезает ли промо на последнюю страницу.
  promoFlow: { width: PROMO_W, height: PROMO_H, marginTop: 22 },
  // Финал: пришпилено к низу последней страницы над футером (Image → без бага глифов).
  promoPinned: { position: 'absolute', bottom: 44, left: 48, width: PROMO_W, height: PROMO_H },
})

function LogoMark() {
  return (
    <Svg width={26} height={31} viewBox="0 0 188 222">
      <G>
        <Path
          d="M60.2305 0.440122L82.123 0.0560271C112.869 -0.313813 138.618 0.479129 162.195 23.8548C204.681 65.9769 192.696 152.806 133.314 173.456C116.277 179.381 99.6963 178.207 81.9333 178.177C90.355 165.201 95.41 155.572 102.492 141.811C115.383 139.153 126.54 139.085 137.676 129.732C150.935 118.595 151.545 105.986 153.02 90.2708C123.202 86.9805 111.159 102.143 102.085 127.835C100.734 132.267 98.5233 138.386 93.9025 140.336L92.374 139.601C88.9338 133.868 92.0343 125.169 90.1863 117.771C87.8778 107.543 82.378 99.5498 73.4073 94.0135C66.2298 89.5836 49.8363 86.9242 45.616 96.7779C37.849 114.911 54.163 132.795 70.7823 137.823C75.571 139.272 81.6318 140.324 86.1468 142.35C86.614 146.014 84.2568 149.867 82.5738 152.995C79.81 158.135 76.6758 163.391 72.8005 167.765C62.1828 179.745 20.095 217.419 5.90576 221.357C3.86501 221.924 2.86076 221.83 1.08551 220.813C-0.46624 216.428 0.101519 197.9 0.100769 192.424L0.107521 147.101L0.0565264 93.5956C0.0542764 85.3106 0.0962661 77.0188 0.158516 68.7383C0.430766 32.7107 23.1288 3.65166 60.2305 0.440122Z"
          fill={c.brand500}
        />
        <Path
          d="M116.496 33.614C118.481 35.1564 121.204 42.1496 122.364 44.8788C125.793 52.9477 134.089 55.3633 141.854 58.274C123.646 66.0969 125.651 66.4915 117.169 83.7923C115.737 82.4847 111.533 73.2439 110.55 70.9011C107.427 63.4615 98.4941 60.9829 91.1021 58.3708C107.486 52.8209 110.537 49.7595 116.496 33.614Z"
          fill={c.warm400}
        />
      </G>
    </Svg>
  )
}

function renderBlock(b: DocBlock, i: number) {
  switch (b.type) {
    case 'heading':
      if (b.level === 1) {
        return (
          <Text key={i} style={styles.h1}>
            {b.text}
          </Text>
        )
      }
      return (
        <View key={i} style={styles.h2Row} wrap={false} minPresenceAhead={40}>
          <View style={styles.h2Bar} />
          <Text style={styles.h2}>{b.text}</Text>
        </View>
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
            <View key={j} style={styles.bulletRow} wrap={false}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{it}</Text>
            </View>
          ))}
        </View>
      )
    case 'metaTable':
      return (
        <View key={i} style={styles.metaCard}>
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

// Промо рендерим ТОЛЬКО в потоке (last-page, после контента). Абсолютное
// позиционирование в @react-pdf/renderer v4 роняет первые латинские глифы текста
// none — без промо; flow — промо-картинка в потоке (замер, влезает ли); pinned —
// картинка пришпилена к низу последней страницы (out of flow, страниц не добавляет).
type PromoMode = 'none' | 'flow' | 'pinned'

export function ScenarioPdf({
  content,
  meta,
  promo = 'pinned',
}: { content: ScenarioContent; meta: ExportMeta; promo?: PromoMode }) {
  const allBlocks = buildScenarioDocument(content, meta)
  // Дисклеймер об ИИ выносим в фирменный футер (он есть на каждой странице).
  const disclaimer = allBlocks.find(
    (b): b is Extract<DocBlock, { type: 'paragraph' }> =>
      b.type === 'paragraph' && b.text.startsWith(DISCLAIMER_PREFIX),
  )
  const blocks = allBlocks.filter((b) => b !== disclaimer)
  const disclaimerText =
    disclaimer?.text ??
    'Сценарий сгенерирован ИИ-сервисом и может содержать неточности. Проверьте факты перед проведением занятия.'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <LogoMark />
          <View style={styles.headerText}>
            <Text style={styles.wordmark}>Planwise</Text>
            <Text style={styles.tagline}>Сценарий внеурочного занятия</Text>
          </View>
        </View>
        {blocks.map(renderBlock)}
        {promo === 'flow' && <Image src={PROMO_PATH} style={styles.promoFlow} />}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{disclaimerText}</Text>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
        {promo === 'pinned' && <Image src={PROMO_PATH} style={styles.promoPinned} />}
      </Page>
    </Document>
  )
}

function countPages(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

export async function renderScenarioPdf(
  content: ScenarioContent,
  meta: ExportMeta,
): Promise<Buffer> {
  ensureFonts()
  const withoutPromo = await renderToBuffer(
    <ScenarioPdf content={content} meta={meta} promo="none" />,
  )
  // Промо добавляем, только если оно влезает на последнюю страницу без новой:
  // сравниваем число страниц «как есть» и «с промо в потоке».
  const withFlowPromo = await renderToBuffer(
    <ScenarioPdf content={content} meta={meta} promo="flow" />,
  )
  if (countPages(withFlowPromo) !== countPages(withoutPromo)) {
    return withoutPromo
  }
  // Влезает → финальный рендер с картинкой, пришпиленной к низу последней страницы.
  return renderToBuffer(<ScenarioPdf content={content} meta={meta} promo="pinned" />)
}
