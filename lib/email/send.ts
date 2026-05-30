import { getFromAddress, getTransport } from './client'
import { passwordResetTemplate, verifyEmailTemplate } from './templates'

export type SendResult = { ok: true } | { ok: false; error: string }

async function sendRaw(
  to: string,
  tpl: { subject: string; html: string; text: string },
): Promise<SendResult> {
  try {
    const transport = getTransport()
    await transport.sendMail({
      from: getFromAddress(),
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[email] send failed:', msg)
    return { ok: false, error: msg }
  }
}

export async function sendVerificationEmail(to: string, url: string): Promise<SendResult> {
  return sendRaw(to, verifyEmailTemplate(url))
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<SendResult> {
  return sendRaw(to, passwordResetTemplate(url))
}
