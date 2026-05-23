import { getGigaConfig } from '@/lib/gigachat/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEYS = [
  'LLM_PROVIDER',
  'LLM_API_BASE',
  'LLM_MODEL',
  'LLM_EMBED_MODEL',
  'LLM_API_KEY',
  'GIGACHAT_AUTH_KEY',
  'GIGACHAT_API_BASE',
  'GIGACHAT_MODEL',
  'GIGACHAT_EMBED_MODEL',
]

beforeEach(() => {
  for (const k of KEYS) vi.stubEnv(k, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getGigaConfig', () => {
  it('defaults to the gigachat provider and requires GIGACHAT_AUTH_KEY', () => {
    expect(() => getGigaConfig()).toThrow(/GIGACHAT_AUTH_KEY/)
  })

  it('uses GigaChat defaults when only the auth key is set', () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'k')
    const cfg = getGigaConfig()
    expect(cfg.provider).toBe('gigachat')
    expect(cfg.apiBase).toBe('https://gigachat.devices.sberbank.ru/api/v1')
    expect(cfg.model).toBe('GigaChat-2-Max')
    expect(cfg.embedModel).toBe('EmbeddingsGigaR')
  })

  it('does not require GIGACHAT_AUTH_KEY when provider=openai', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai')
    vi.stubEnv('LLM_API_BASE', 'http://host.docker.internal:11434/v1')
    vi.stubEnv('LLM_MODEL', 'llama3.1')
    const cfg = getGigaConfig()
    expect(cfg.provider).toBe('openai')
    expect(cfg.apiBase).toBe('http://host.docker.internal:11434/v1')
    expect(cfg.model).toBe('llama3.1')
  })

  it('prefers generic LLM_* over GIGACHAT_* for base/model/embed', () => {
    vi.stubEnv('GIGACHAT_AUTH_KEY', 'k')
    vi.stubEnv('GIGACHAT_API_BASE', 'https://giga/api/v1')
    vi.stubEnv('GIGACHAT_MODEL', 'GigaChat-2-Max')
    vi.stubEnv('LLM_API_BASE', 'http://localhost:11434/v1')
    vi.stubEnv('LLM_MODEL', 'qwen2.5')
    vi.stubEnv('LLM_EMBED_MODEL', 'nomic-embed-text')
    const cfg = getGigaConfig()
    expect(cfg.apiBase).toBe('http://localhost:11434/v1')
    expect(cfg.model).toBe('qwen2.5')
    expect(cfg.embedModel).toBe('nomic-embed-text')
  })
})
