import nodemailer, { type Transporter } from 'nodemailer'

let cached: Transporter | null = null

export function getTransport(): Transporter {
  if (cached) return cached
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? '465')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) {
    throw new Error('SMTP_HOST/SMTP_USER/SMTP_PASS не настроены')
  }
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return cached
}

export function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? 'Planwise <planwise@caspernik.ru>'
}

export function __resetTransportForTests(): void {
  cached = null
}
