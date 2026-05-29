import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetForTests,
  QueueOverflowError,
  QueueTimeoutError,
  withGigaChatSlot,
} from '@/lib/gigachat/concurrency'

beforeEach(() => {
  vi.useFakeTimers()
  process.env.GIGACHAT_MAX_CONCURRENCY = '1'
  process.env.GIGACHAT_QUEUE_MAX = '10'
  process.env.GIGACHAT_QUEUE_TIMEOUT_MS = '300000'
  __resetForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('withGigaChatSlot', () => {
  it('N=1: первый идёт сразу, второй ждёт, onQueued(1) вызван', async () => {
    const d1 = deferred()
    const d2 = deferred()
    const order: string[] = []
    const onQueued2 = vi.fn()

    const p1 = withGigaChatSlot(async () => {
      order.push('1-start')
      await d1.promise
      order.push('1-end')
    })
    const p2 = withGigaChatSlot(
      async () => {
        order.push('2-start')
        await d2.promise
      },
      { onQueued: onQueued2 },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['1-start'])
    expect(onQueued2).toHaveBeenCalledWith(1)

    d1.resolve()
    await p1
    await Promise.resolve()
    expect(order).toEqual(['1-start', '1-end', '2-start'])

    d2.resolve()
    await p2
  })

  it('сдвиг очереди: при освобождении третий получает onQueued(1)', async () => {
    const d1 = deferred()
    const d2 = deferred()
    const onQ2 = vi.fn()
    const onQ3 = vi.fn()

    const p1 = withGigaChatSlot(() => d1.promise)
    const p2 = withGigaChatSlot(() => d2.promise, { onQueued: onQ2 })
    const p3 = withGigaChatSlot(() => Promise.resolve(), { onQueued: onQ3 })

    await Promise.resolve()
    expect(onQ2).toHaveBeenCalledWith(1)
    expect(onQ3).toHaveBeenCalledWith(2)

    d1.resolve()
    await p1
    await Promise.resolve()
    await Promise.resolve()
    expect(onQ3).toHaveBeenLastCalledWith(1)

    d2.resolve()
    await p2
    await p3
  })

  it('QueueOverflowError при превышении длины очереди', async () => {
    process.env.GIGACHAT_QUEUE_MAX = '2'
    __resetForTests()
    const d1 = deferred()
    const p1 = withGigaChatSlot(() => d1.promise)
    const p2 = withGigaChatSlot(() => Promise.resolve())
    const p3 = withGigaChatSlot(() => Promise.resolve())
    await expect(withGigaChatSlot(() => Promise.resolve())).rejects.toBeInstanceOf(
      QueueOverflowError,
    )
    d1.resolve()
    await Promise.all([p1, p2, p3])
  })

  it('QueueTimeoutError по истечении GIGACHAT_QUEUE_TIMEOUT_MS', async () => {
    process.env.GIGACHAT_QUEUE_TIMEOUT_MS = '1000'
    __resetForTests()
    const d1 = deferred()
    const p1 = withGigaChatSlot(() => d1.promise)
    const fn2 = vi.fn(async () => 'ok')
    const p2 = withGigaChatSlot(fn2)

    vi.advanceTimersByTime(1000)
    await expect(p2).rejects.toBeInstanceOf(QueueTimeoutError)
    expect(fn2).not.toHaveBeenCalled()

    d1.resolve()
    await p1
  })

  it('AbortSignal до получения слота: запрос снят, fn не вызывается', async () => {
    const d1 = deferred()
    const p1 = withGigaChatSlot(() => d1.promise)
    const ctrl = new AbortController()
    const fn2 = vi.fn(async () => 'ok')
    const p2 = withGigaChatSlot(fn2, { signal: ctrl.signal })

    await Promise.resolve()
    ctrl.abort(new Error('cancelled'))
    await expect(p2).rejects.toThrow('cancelled')
    expect(fn2).not.toHaveBeenCalled()

    d1.resolve()
    await p1
  })

  it('N=2: два запроса параллельно, третий ждёт', async () => {
    process.env.GIGACHAT_MAX_CONCURRENCY = '2'
    __resetForTests()
    const d1 = deferred()
    const d2 = deferred()
    const onQ3 = vi.fn()
    const started: string[] = []

    const p1 = withGigaChatSlot(async () => {
      started.push('1')
      await d1.promise
    })
    const p2 = withGigaChatSlot(async () => {
      started.push('2')
      await d2.promise
    })
    const p3 = withGigaChatSlot(
      async () => {
        started.push('3')
      },
      { onQueued: onQ3 },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual(['1', '2'])
    expect(onQ3).toHaveBeenCalledWith(1)

    d1.resolve()
    await p1
    d2.resolve()
    await p2
    await p3
  })
})
