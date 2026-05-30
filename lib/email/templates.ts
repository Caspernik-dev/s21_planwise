export type EmailTemplate = { subject: string; html: string; text: string }

const BTN_STYLE =
  'display:inline-block;padding:12px 24px;background:#0e4f30;color:#ffffff;text-decoration:none;border-radius:8px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600'
const WRAPPER_OPEN =
  '<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px;line-height:1.5">'
const WRAPPER_CLOSE =
  '<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"/><p style="color:#6b7280;font-size:13px">Planwise — генератор сценариев внеурочных занятий.</p></div>'

export function verifyEmailTemplate(url: string): EmailTemplate {
  const subject = 'Planwise — подтвердите email'
  const html = `${WRAPPER_OPEN}<h2 style="margin:0 0 16px 0">Подтвердите ваш email</h2><p>Спасибо за регистрацию в Planwise. Чтобы подтвердить адрес почты, нажмите на кнопку ниже:</p><p style="margin:24px 0"><a href="${url}" style="${BTN_STYLE}">Подтвердить email</a></p><p style="color:#6b7280;font-size:13px">Если кнопка не работает, скопируйте ссылку в браузер:<br/><a href="${url}">${url}</a></p><p style="color:#6b7280;font-size:13px">Ссылка действует 24 часа. Если вы не регистрировались — просто проигнорируйте письмо.</p>${WRAPPER_CLOSE}`
  const text = `Подтвердите ваш email в Planwise.\n\nПерейдите по ссылке: ${url}\n\nСсылка действует 24 часа. Если вы не регистрировались — проигнорируйте письмо.\n`
  return { subject, html, text }
}

export function passwordResetTemplate(url: string): EmailTemplate {
  const subject = 'Planwise — сброс пароля'
  const html = `${WRAPPER_OPEN}<h2 style="margin:0 0 16px 0">Сброс пароля</h2><p>Мы получили запрос на сброс пароля для вашего аккаунта Planwise. Чтобы задать новый пароль, нажмите на кнопку ниже:</p><p style="margin:24px 0"><a href="${url}" style="${BTN_STYLE}">Сбросить пароль</a></p><p style="color:#6b7280;font-size:13px">Если кнопка не работает, скопируйте ссылку в браузер:<br/><a href="${url}">${url}</a></p><p style="color:#6b7280;font-size:13px">Ссылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо, ваш пароль останется прежним.</p>${WRAPPER_CLOSE}`
  const text = `Сброс пароля в Planwise.\n\nПерейдите по ссылке: ${url}\n\nСсылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо.\n`
  return { subject, html, text }
}
