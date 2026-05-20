// GigaChat использует сертификаты «Минцифры РФ». Если в окружении нет корневого
// сертификата и GIGACHAT_INSECURE_TLS=true — отключаем проверку TLS на уровне
// процесса (только dev). Node-овский глобальный fetch уважает
// NODE_TLS_REJECT_UNAUTHORIZED; userland-undici Agent через опцию `dispatcher`
// несовместим со встроенным fetch (Node 24 → UND_ERR_INVALID_ARG).
// Прод: ставить корневой сертификат через NODE_EXTRA_CA_CERTS и держать флаг false.
let applied = false

export function ensureInsecureTls(insecure: boolean): void {
  if (!insecure || applied) return
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  applied = true
}
