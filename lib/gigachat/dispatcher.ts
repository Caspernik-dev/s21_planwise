import { Agent } from 'undici'

// undici Agent с отключённой проверкой TLS — только когда GIGACHAT_INSECURE_TLS=true.
// Обход скоупится на GigaChat-запросы (передаётся в опцию `dispatcher` конкретного fetch),
// не трогает остальной TLS. В тестах fetch замокан → диспетчер не используется.
let agent: Agent | null = null

export function getDispatcher(insecure: boolean): Agent | undefined {
  if (!insecure) return undefined
  if (!agent) agent = new Agent({ connect: { rejectUnauthorized: false } })
  return agent
}
