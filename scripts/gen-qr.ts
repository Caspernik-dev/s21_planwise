/**
 * Генерирует статичный QR-код на сайт Planwise для вшивания в экспортный PDF.
 * URL фиксированный → QR статичен, генерируем один раз и коммитим PNG.
 * Запуск: pnpm exec tsx scripts/gen-qr.ts
 */
import path from 'node:path'
import QRCode from 'qrcode'

const URL = 'https://plan-wise.ru'
const OUT = path.join(process.cwd(), 'assets', 'qr-planwise.png')

async function main() {
  await QRCode.toFile(OUT, URL, {
    type: 'png',
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0e4f30', light: '#ffffff' },
  })
  console.log('QR →', OUT)
}

main()
