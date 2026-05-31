// server-only: этот модуль используется только из server routes/actions.
import QRCode from 'qrcode'

// Фирменный brand-700 (#0e4f30) для совпадения с лого Planwise.
const BRAND_DARK = '#0e4f30'

export async function renderQrDataUrl(text: string, size = 160): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: size,
    color: { dark: BRAND_DARK, light: '#ffffff' },
  })
}
