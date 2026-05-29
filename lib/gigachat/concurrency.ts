export class QueueOverflowError extends Error {
  constructor() {
    super('GigaChat queue overflow')
    this.name = 'QueueOverflowError'
  }
}
export class QueueTimeoutError extends Error {
  constructor() {
    super('GigaChat queue timeout')
    this.name = 'QueueTimeoutError'
  }
}

export type QueueOptions = {
  onQueued?: (position: number) => void
  signal?: AbortSignal
}

type Waiter = {
  onQueued?: (position: number) => void
  resolveSlot: () => void
  rejectWaiter: (err: unknown) => void
  timer: ReturnType<typeof setTimeout> | null
  onAbort: (() => void) | null
  signal?: AbortSignal
  acquired: boolean
}

let active = 0
const queue: Waiter[] = []

function cfg() {
  return {
    max: Math.max(1, Number(process.env.GIGACHAT_MAX_CONCURRENCY ?? '1')),
    queueMax: Math.max(0, Number(process.env.GIGACHAT_QUEUE_MAX ?? '10')),
    timeoutMs: Math.max(1000, Number(process.env.GIGACHAT_QUEUE_TIMEOUT_MS ?? '300000')),
  }
}

function notifyPositions() {
  for (let i = 0; i < queue.length; i++) {
    const w = queue[i]
    if (!w.acquired && w.onQueued) w.onQueued(i + 1)
  }
}

function release() {
  active = Math.max(0, active - 1)
  drain()
}

function drain() {
  const { max } = cfg()
  while (active < max && queue.length > 0) {
    const w = queue.shift()
    if (!w) break
    if (w.acquired) continue
    w.acquired = true
    if (w.timer) clearTimeout(w.timer)
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort)
    active++
    w.resolveSlot()
  }
  notifyPositions()
}

function removeFromQueue(w: Waiter) {
  const idx = queue.indexOf(w)
  if (idx >= 0) queue.splice(idx, 1)
}

export async function withGigaChatSlot<T>(
  fn: () => Promise<T>,
  opts: QueueOptions = {},
): Promise<T> {
  const { max, queueMax, timeoutMs } = cfg()

  if (active < max) {
    active++
    try {
      return await fn()
    } finally {
      release()
    }
  }

  if (queue.length >= queueMax) {
    throw new QueueOverflowError()
  }

  const slotReady = new Promise<void>((resolveSlot, rejectWaiter) => {
    const w: Waiter = {
      onQueued: opts.onQueued,
      resolveSlot,
      rejectWaiter,
      timer: null,
      onAbort: null,
      signal: opts.signal,
      acquired: false,
    }
    w.timer = setTimeout(() => {
      removeFromQueue(w)
      if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort)
      rejectWaiter(new QueueTimeoutError())
      notifyPositions()
    }, timeoutMs)
    if (opts.signal) {
      const onAbort = () => {
        if (w.acquired) return
        removeFromQueue(w)
        if (w.timer) clearTimeout(w.timer)
        rejectWaiter(opts.signal?.reason ?? new Error('aborted'))
        notifyPositions()
      }
      w.onAbort = onAbort
      if (opts.signal.aborted) {
        onAbort()
        return
      }
      opts.signal.addEventListener('abort', onAbort)
    }
    queue.push(w)
    if (opts.onQueued) opts.onQueued(queue.length)
  })

  await slotReady

  try {
    return await fn()
  } finally {
    release()
  }
}

export function __resetForTests() {
  active = 0
  for (const w of queue) {
    if (w.timer) clearTimeout(w.timer)
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort)
  }
  queue.length = 0
}
