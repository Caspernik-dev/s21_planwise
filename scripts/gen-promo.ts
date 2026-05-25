/**
 * Запекает промо-блок PDF-экспорта в статичный PNG (текст + QR).
 * Зачем: @react-pdf/renderer v4 нестабильно роняет глифы субсетного шрифта в
 * составных документах («Planwise»→«anwise»); картинка иммунна к этому багу.
 * Контент статичен → генерируем один раз и коммитим. Запуск: pnpm gen:promo
 * (зависит от assets/qr-planwise.png — сначала pnpm gen:qr).
 */
import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = process.cwd()
const fontDir = path.join(root, 'assets', 'fonts')
const qrB64 = fs.readFileSync(path.join(root, 'assets', 'qr-planwise.png')).toString('base64')
const OUT = path.join(root, 'assets', 'promo-card.png')

// Палитра Planwise
const BRAND50 = '#edfbf4'
const BRAND100 = '#d0f5e3'
const BRAND600 = '#178550'
const BRAND700 = '#12663e'
const NEUTRAL700 = '#3d4039'

// Холст 2x для чёткости (в PDF масштабируется по ширине контента).
const W = 1000
const H = 232
const PAD = 30
const QR = 152

const bodyLines = [
  'Planwise — ИИ-генератор сценариев внеурочных занятий с опорой',
  'на методички «Разговоров о важном». Подберёт под класс, тему,',
  'формат, оформит и даст скачать.',
]

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="18" fill="${BRAND50}" stroke="${BRAND100}" stroke-width="2"/>
  <text x="${PAD}" y="62" font-family="PT Sans" font-weight="700" font-size="26" fill="${BRAND700}">Создано в Planwise за пару минут</text>
  ${bodyLines
    .map(
      (line, i) =>
        `<text x="${PAD}" y="${104 + i * 32}" font-family="PT Sans" font-weight="400" font-size="20" fill="${NEUTRAL700}">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  <text x="${PAD}" y="208" font-family="PT Sans" font-weight="700" font-size="22" fill="${BRAND600}">plan-wise.ru</text>
  <image x="${W - PAD - QR}" y="${(H - QR) / 2}" width="${QR}" height="${QR}" href="data:image/png;base64,${qrB64}"/>
</svg>`

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const resvg = new Resvg(svg, {
  background: 'rgba(0,0,0,0)',
  font: {
    loadSystemFonts: false,
    fontFiles: [path.join(fontDir, 'PTSans-Regular.ttf'), path.join(fontDir, 'PTSans-Bold.ttf')],
    defaultFontFamily: 'PT Sans',
  },
})
fs.writeFileSync(OUT, resvg.render().asPng())
console.log('Промо-PNG →', OUT, `(${W}×${H})`)
