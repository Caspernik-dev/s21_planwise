import type { Metadata } from 'next'
import { Inter, Onest } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
})
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Классный час — ИИ-генератор сценариев внеурочки',
  description:
    'Генерация сценариев классных часов, квизов, бесед и игр с опорой на методические материалы',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${onest.variable}`}>
      <body>{children}</body>
    </html>
  )
}
