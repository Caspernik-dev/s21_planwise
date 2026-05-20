import { likes, sharedScenarios } from '@/db/schema'
import { describe, expect, it } from 'vitest'

describe('community schema', () => {
  it('likes has user/scenario/optInShare columns', () => {
    expect(likes.userId).toBeDefined()
    expect(likes.scenarioId).toBeDefined()
    expect(likes.optInShare).toBeDefined()
  })
  it('sharedScenarios has anonymizedContent, embedding, likeCount, sourceScenarioId', () => {
    expect(sharedScenarios.anonymizedContent).toBeDefined()
    expect(sharedScenarios.embedding).toBeDefined()
    expect(sharedScenarios.likeCount).toBeDefined()
    expect(sharedScenarios.sourceScenarioId).toBeDefined()
  })
})
