import type { GenerationInput, GenerationMeta, ScenarioContent } from '@/lib/scenario/schema'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { tsvector, vector } from './types'

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'), // null если OAuth (в будущем)
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  role: text('role').notNull().default('user'),
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
  embedding: vector('embedding', { dimensions: 1024 }),
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

export const workPlans = pgTable('work_plans', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  originalFilename: text('original_filename'),
  rawText: text('raw_text').notNull(), // хранится анонимизированный текст (или оригинал при согласии)
  anonymized: boolean('anonymized').notNull().default(true),
  piiFoundCount: integer('pii_found_count').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const planTopics = pgTable('plan_topics', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workPlanId: text('work_plan_id')
    .notNull()
    .references(() => workPlans.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  plannedDate: text('planned_date'),
  orderIdx: integer('order_idx').notNull(),
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

export const ragDocuments = pgTable('rag_documents', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  source: text('source').notNull(),
  title: text('title').notNull(),
  gradeRange: text('grade_range'),
  direction: text('direction'),
  rawUrl: text('raw_url').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const ragChunks = pgTable('rag_chunks', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  documentId: text('document_id')
    .notNull()
    .references(() => ragDocuments.id, { onDelete: 'cascade' }),
  chunkText: text('chunk_text').notNull(),
  chunkHash: text('chunk_hash').notNull().unique(),
  chunkMeta: jsonb('chunk_meta')
    .$type<{
      source: string
      document_title: string
      direction: string | null
      grade_min: number
      grade_max: number
      section_kind: string
      stage_idx?: number
    }>()
    .notNull(),
  embedding: vector('embedding', { dimensions: 1024 }).notNull(),
  tsv: tsvector('tsv'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const likes = pgTable(
  'likes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    optInShare: boolean('opt_in_share').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique('likes_user_scenario_uq').on(t.userId, t.scenarioId) }),
)

export const sharedScenarios = pgTable(
  'shared_scenarios',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceScenarioId: text('source_scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    anonymizedContent: jsonb('anonymized_content').$type<ScenarioContent>().notNull(),
    direction: text('direction').notNull(),
    grade: integer('grade').notNull(),
    durationMin: integer('duration_min').notNull(),
    format: text('format').notNull(),
    topic: text('topic').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),
    likeCount: integer('like_count').notNull().default(1),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUq: unique('shared_source_scenario_uq').on(t.sourceScenarioId),
    dirIdx: index('shared_direction_idx').on(t.direction),
  }),
)

export const rateBuckets = pgTable(
  'rate_buckets',
  {
    key: text('key').notNull(),
    subject: text('subject').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.subject, t.windowStart] }),
  }),
)

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    eventDate: text('event_date').notNull(), // ISO YYYY-MM-DD
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    byUserDate: index('calendar_events_user_date_idx').on(t.userId, t.eventDate),
  }),
)

export const events = pgTable(
  'events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(), // 'export' | 'login' | 'search'
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    byTypeCreated: index('events_type_created_idx').on(t.type, t.createdAt),
  }),
)
