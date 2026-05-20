import { integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import type { GenerationInput, GenerationMeta, ScenarioContent } from '@/lib/scenario/schema'

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'), // null если OAuth (в будущем)
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) }),
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
)

export const scenarios = pgTable('scenarios', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  direction: text('direction').notNull(),
  grade: integer('grade').notNull(),
  durationMin: integer('duration_min').notNull(),
  format: text('format').notNull(),
  topic: text('topic').notNull(),
  // Forward-compat: источники (таблицы plan_topics/shared_scenarios появятся в своих планах).
  sourcePlanTopicId: text('source_plan_topic_id'),
  sourceSharedId: text('source_shared_id'),
  content: jsonb('content').$type<ScenarioContent>().notNull(),
  inputContext: jsonb('input_context').$type<GenerationInput>().notNull(),
  generationMeta: jsonb('generation_meta').$type<GenerationMeta>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const scenarioVersions = pgTable('scenario_versions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  scenarioId: text('scenario_id')
    .notNull()
    .references(() => scenarios.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<ScenarioContent>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const generations = pgTable('generations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scenarioId: text('scenario_id').references(() => scenarios.id, { onDelete: 'set null' }),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  status: text('status').notNull(), // 'ok' | 'error'
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})
