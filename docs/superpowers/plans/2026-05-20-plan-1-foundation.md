# Plan 1 — Foundation (Next.js + Postgres + Auth)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять рабочий Next.js-монолит с дизайн-токенами из `design_example`, Docker-Postgres+pgvector, Drizzle ORM, Auth.js (email/пароль) и защищённый `/app`-шелл. После этого плана пользователь может зарегистрироваться, войти и увидеть пустой дашборд.

**Architecture:** Single Next.js 15 App Router project (TypeScript). Postgres 16 + pgvector в Docker. Drizzle для миграций и запросов. Auth.js v5 с credentials provider и bcrypt для паролей. Все стили — Tailwind с токенами из `design_example/tailwind.config.ts`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, shadcn/ui, Drizzle ORM, PostgreSQL 16 + pgvector, Auth.js v5 (NextAuth), bcryptjs, Vitest, Biome, pnpm.

**Out of scope (для последующих планов):** генерация, RAG, PII, файлы, экспорт, редактор, лайки, библиотека. Только фундамент.

---

## Файловая структура к концу плана

```
/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts          # из design_example, расширим content paths
├── postcss.config.mjs
├── biome.json                  # линтер/форматтер
├── vitest.config.ts
├── drizzle.config.ts
├── docker-compose.yml          # postgres+pgvector
├── Dockerfile                  # для прод-сборки (заготовка)
├── .env.example
├── .env.local                  # gitignored
├── .gitignore
├── README.md
│
├── db/
│   ├── schema.ts               # users, sessions, accounts, verificationTokens
│   ├── index.ts                # drizzle client
│   └── migrations/             # сгенерированные SQL
│
├── auth.ts                     # Auth.js конфиг
├── middleware.ts               # защита /app/*
│
├── app/
│   ├── layout.tsx              # root layout: Inter + Onest, globals.css
│   ├── globals.css             # из design_example
│   ├── page.tsx                # лендинг (минимальный, hero + cta)
│   ├── (auth)/
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   └── actions.ts      # server action login
│   │   └── register/
│   │       ├── page.tsx
│   │       └── actions.ts      # server action register
│   ├── (app)/
│   │   ├── layout.tsx          # navbar + auth gate
│   │   └── page.tsx            # пустой дашборд
│   └── api/
│       └── auth/[...nextauth]/route.ts
│
├── components/
│   ├── ui/                     # shadcn primitives
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   └── card.tsx
│   └── nav/
│       └── AppNavbar.tsx
│
├── lib/
│   ├── utils.ts                # cn() helper
│   └── auth/
│       └── password.ts         # bcrypt hash/verify
│
└── tests/
    ├── setup.ts
    └── lib/auth/password.test.ts
```

---

## Task 1: Init Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `pnpm-lock.yaml` (генерируется)

- [ ] **Step 1: Создать `package.json`**

```json
{
  "name": "klassniy-chas",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx db/migrate.ts",
    "db:studio": "drizzle-kit studio",
    "db:up": "docker compose up -d db",
    "db:down": "docker compose down"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0-rc-66855b96-20241106",
    "react-dom": "19.0.0-rc-66855b96-20241106",
    "next-auth": "5.0.0-beta.25",
    "@auth/drizzle-adapter": "^1.7.4",
    "drizzle-orm": "^0.36.4",
    "postgres": "^3.4.5",
    "bcryptjs": "^2.4.3",
    "zod": "^3.23.8",
    "react-hook-form": "^7.53.2",
    "@hookform/resolvers": "^3.9.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5",
    "class-variance-authority": "^0.7.1",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.28.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "tailwindcss-animate": "^1.0.7",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Создать `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Создать `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
}

export default config
```

- [ ] **Step 4: Создать `.gitignore`**

```
node_modules
.next
out
dist
.env*.local
*.log
.DS_Store
coverage
.vitest
.drizzle
```

- [ ] **Step 5: Установить зависимости и зафиксировать**

Run: `pnpm install`
Expected: `Done` без ошибок, появляется `pnpm-lock.yaml` и `node_modules/`.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json next.config.ts .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold next.js project with pinned deps"
```

---

## Task 2: Tailwind + дизайн-токены из design_example

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`
- Modify: ничего (новые файлы)

- [ ] **Step 1: Создать `postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 2: Создать `tailwind.config.ts`**

Скопировать целиком из `design_example/tailwind.config.ts`, но `content` расширить:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edfbf4', 100: '#d0f5e3', 200: '#a3eac8', 300: '#66d9a7',
          400: '#2ec27f', 500: '#21A663', 600: '#178550', 700: '#12663e',
          800: '#0e4f30', 900: '#093520', 950: '#041a10',
        },
        neutral: {
          0: '#ffffff', 50: '#f8f9f7', 100: '#f0f1ee', 200: '#e4e6e1',
          300: '#cdd0c8', 400: '#9ea39a', 500: '#717670', 600: '#555a52',
          700: '#3d4039', 800: '#272a24', 900: '#14160f',
        },
        accent: {
          50: '#e8f0ff', 100: '#c4d5ff', 200: '#92adff', 300: '#5a7ef9',
          400: '#3d5af1', 500: '#2741e0', 600: '#1c30c0', 700: '#14239a',
          800: '#0e1870', 900: '#090e47',
        },
        warm: {
          50: '#fff8e8', 100: '#ffefc0', 200: '#ffe08a', 300: '#ffcc4a',
          400: '#f5b800', 500: '#d49800', 600: '#b07800', 700: '#8a5c00',
          800: '#634200', 900: '#3d2900',
        },
        success: '#21A663',
        warning: '#f5b800',
        error: '#e8403a',
        info: '#3d5af1',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px',
        '2xl': '24px', '3xl': '32px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        hover: '0 4px 24px rgba(0,0,0,0.10)',
        brand: '0 4px 20px rgba(33,166,99,0.25)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease both',
        'fade-in': 'fadeIn 0.4s ease both',
        'scale-in': 'scaleIn 0.3s ease both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
```

- [ ] **Step 3: Создать `app/globals.css`** (1-в-1 из design_example)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --font-sans: 'Inter', system-ui, sans-serif;
    --font-display: 'Onest', 'Inter', system-ui, sans-serif;
    --background: 248 249 247;
    --foreground: 20 22 15;
  }
  html { scroll-behavior: smooth; }
  body {
    @apply bg-neutral-50 text-neutral-900 antialiased;
    font-family: var(--font-sans);
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-display);
    @apply tracking-tight;
  }
}

@layer utilities {
  .animate-delay-100 { animation-delay: 100ms; }
  .animate-delay-200 { animation-delay: 200ms; }
  .animate-delay-300 { animation-delay: 300ms; }
  .animate-delay-400 { animation-delay: 400ms; }
}
```

- [ ] **Step 4: Создать `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Inter, Onest } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
})
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Классный час — ИИ-генератор сценариев внеурочки',
  description: 'Генерация сценариев классных часов, квизов, бесед и игр с опорой на методические материалы',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${onest.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: Создать минимальный `app/page.tsx`**

```tsx
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl text-center animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 ring-1 ring-brand-200">
          MVP · хакатон
        </span>
        <h1 className="mt-6 text-5xl font-semibold text-neutral-900">
          Классный час за 30 секунд
        </h1>
        <p className="mt-4 text-lg text-neutral-600">
          ИИ-генератор сценариев внеурочной деятельности с опорой на методички и
          лайки сообщества.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/register"
            className="rounded-md bg-brand-500 px-6 py-3 text-white shadow-brand hover:bg-brand-600 transition"
          >
            Начать
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-neutral-0 px-6 py-3 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
          >
            Войти
          </Link>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Запустить dev-сервер и убедиться что страница рендерится**

Run: `pnpm dev`
Expected: лог `Ready in ...`, открыть `http://localhost:3000` — видна страница с заголовком «Классный час за 30 секунд». Никаких ошибок в консоли.
Затем Ctrl-C для остановки.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.ts postcss.config.mjs app/
git commit -m "feat: tailwind + design tokens from design_example, minimal landing"
```

---

## Task 3: shadcn/ui primitives (Button, Input, Label, Card)

**Files:**
- Create: `lib/utils.ts`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`

- [ ] **Step 1: Создать `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Создать `components/ui/button.tsx`**

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand-500 text-white shadow-brand hover:bg-brand-600',
        outline: 'bg-neutral-0 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50',
        ghost: 'text-neutral-700 hover:bg-neutral-100',
        destructive: 'bg-error text-white hover:opacity-90',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
```

- [ ] **Step 3: Создать `components/ui/input.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md bg-neutral-0 px-3 py-2 text-sm text-neutral-900 ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
```

- [ ] **Step 4: Создать `components/ui/label.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium text-neutral-700', className)} {...props} />
  ),
)
Label.displayName = 'Label'
```

- [ ] **Step 5: Создать `components/ui/card.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg bg-neutral-0 ring-1 ring-neutral-200 shadow-card', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pb-3', className)} {...props} />
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold text-neutral-900', className)} {...props} />
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-3', className)} {...props} />
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts components/ui/
git commit -m "feat: shadcn-style ui primitives (button, input, label, card)"
```

---

## Task 4: Docker Compose с Postgres+pgvector

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env.local`

- [ ] **Step 1: Создать `docker-compose.yml`**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    container_name: kc-postgres
    environment:
      POSTGRES_USER: kc
      POSTGRES_PASSWORD: kc_dev_pwd
      POSTGRES_DB: kc
    ports:
      - '5433:5432'
    volumes:
      - kc-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U kc -d kc']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  kc-pgdata:
```

- [ ] **Step 2: Создать `.env.example`** (для коммита)

```
# Database
DATABASE_URL=postgres://kc:kc_dev_pwd@localhost:5433/kc

# Auth.js
AUTH_SECRET=replace-with-openssl-rand-base64-32
AUTH_URL=http://localhost:3000

# GigaChat (заполнить в .env.local; на этом этапе плана не используется)
GIGACHAT_AUTH_KEY=
GIGACHAT_SCOPE=GIGACHAT_API_PERS

# PII / RAG (для будущих планов)
PG_TSV_LANG=russian
SIMILARITY_THRESHOLD=0.78
MAX_GENERATIONS_PER_DAY=10
DEMO_USER_EMAILS=
```

- [ ] **Step 3: Создать `.env.local`** (gitignored, для локальной разработки)

```
DATABASE_URL=postgres://kc:kc_dev_pwd@localhost:5433/kc
AUTH_SECRET=local_dev_secret_change_me_in_prod_at_least_32_chars
AUTH_URL=http://localhost:3000
PG_TSV_LANG=russian
SIMILARITY_THRESHOLD=0.78
MAX_GENERATIONS_PER_DAY=10
DEMO_USER_EMAILS=
```

- [ ] **Step 4: Поднять БД и проверить**

Run: `pnpm db:up`
Expected: контейнер `kc-postgres` поднят, healthcheck `healthy`.

Run: `docker exec kc-postgres psql -U kc -d kc -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname='vector';"`
Expected: вывод вроде `0.8.0`, без ошибок.

Run: `docker exec kc-postgres psql -U kc -d kc -c "SELECT to_tsvector('russian', 'тестовый запрос');"`
Expected: вывод вроде `'тестов':1 'запрос':2`. Если ошибка «text search configuration russian does not exist» — записать в issue, на этом этапе плана не критично; будет адресовано в Plan 5.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: postgres+pgvector via docker compose"
```

---

## Task 5: Drizzle setup и схема auth-таблиц

**Files:**
- Create: `drizzle.config.ts`, `db/schema.ts`, `db/index.ts`, `db/migrate.ts`

- [ ] **Step 1: Создать `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://kc:kc_dev_pwd@localhost:5433/kc',
  },
  verbose: true,
  strict: true,
})
```

- [ ] **Step 2: Создать `db/schema.ts`** (только auth-таблицы для этого плана; остальные — в следующих планах)

```ts
import { pgTable, text, timestamp, primaryKey, integer } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),       // null если OAuth (в будущем)
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

// Auth.js drizzle-adapter ожидает эти таблицы:
export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
```

- [ ] **Step 3: Создать `db/index.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

// max=10 достаточно для 4ГБ ноды (Postgres работает с малым числом коннектов)
const client = postgres(url, { max: 10 })

export const db = drizzle(client, { schema })
export type DB = typeof db
```

- [ ] **Step 4: Создать `db/migrate.ts`** (отдельный runner, чтобы не тянуть drizzle-kit в рантайм)

```ts
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  console.log('Applying migrations...')
  await migrate(db, { migrationsFolder: './db/migrations' })
  console.log('Done.')
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 5: Добавить `dotenv` в devDeps**

Run: `pnpm add -D dotenv`
Expected: добавляется без ошибок.

- [ ] **Step 6: Сгенерировать миграцию**

Run: `pnpm db:generate`
Expected: создаётся `db/migrations/0000_<name>.sql` с `CREATE TABLE users/accounts/sessions/verification_tokens`. Также создаётся `db/migrations/meta/`.

- [ ] **Step 7: Применить миграцию**

Сначала убедиться что БД запущена: `docker compose ps` — `kc-postgres` должен быть `Up (healthy)`.
Run: `pnpm db:migrate`
Expected: `Applying migrations...` → `Done.` без ошибок.

Run: `docker exec kc-postgres psql -U kc -d kc -c "\dt"`
Expected: 5 таблиц (`users`, `accounts`, `sessions`, `verification_tokens`, `__drizzle_migrations`).

- [ ] **Step 8: Commit**

```bash
git add drizzle.config.ts db/ package.json pnpm-lock.yaml
git commit -m "feat: drizzle setup, auth schema, initial migration"
```

---

## Task 6: Password helpers с TDD

**Files:**
- Create: `lib/auth/password.ts`, `tests/lib/auth/password.test.ts`, `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Создать `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 2: Создать пустой `tests/setup.ts`** (для будущих хуков)

```ts
// global vitest setup; пока пусто
```

- [ ] **Step 3: Написать падающий тест `tests/lib/auth/password.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

describe('password', () => {
  it('hashPassword returns a bcrypt hash distinct from input', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(hash).toMatch(/^\$2[aby]\$/)
  })

  it('verifyPassword returns true for matching password', async () => {
    const hash = await hashPassword('s3cret!')
    expect(await verifyPassword('s3cret!', hash)).toBe(true)
  })

  it('verifyPassword returns false for non-matching password', async () => {
    const hash = await hashPassword('s3cret!')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('verifyPassword returns false for malformed hash', async () => {
    expect(await verifyPassword('anything', 'not-a-bcrypt-hash')).toBe(false)
  })
})
```

- [ ] **Step 4: Запустить тест — должен упасть**

Run: `pnpm test tests/lib/auth/password.test.ts`
Expected: FAIL, ошибка вида `Cannot find module '@/lib/auth/password'`.

- [ ] **Step 5: Создать `lib/auth/password.ts`**

```ts
import bcrypt from 'bcryptjs'

const COST = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}
```

- [ ] **Step 6: Запустить тест — должен пройти**

Run: `pnpm test tests/lib/auth/password.test.ts`
Expected: PASS все 4 теста.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/ lib/auth/
git commit -m "feat(auth): bcrypt password helpers with tests"
```

---

## Task 7: Auth.js v5 конфиг

**Files:**
- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`

- [ ] **Step 1: Создать `auth.ts`** (корень проекта)

```ts
import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifyPassword } from '@/lib/auth/password'

declare module 'next-auth' {
  interface Session {
    user: { id: string; email: string; name?: string | null } & DefaultSession['user']
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt' },          // JWT — проще, не требует таблицы sessions для caching
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Пароль', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').toLowerCase().trim()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!user || !user.passwordHash) return null

        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) return null

        return { id: user.id, email: user.email, name: user.name ?? null }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id as string
      return token
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
})
```

- [ ] **Step 2: Создать `app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 3: Создать `middleware.ts`** (защита `/app/*`)

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export default auth((req) => {
  const isApp = req.nextUrl.pathname.startsWith('/app')
  const isAuthed = !!req.auth

  if (isApp && !isAuthed) {
    const url = new URL('/login', req.nextUrl)
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/app/:path*'],
}
```

- [ ] **Step 4: Проверить, что dev-сервер запускается**

Run: `pnpm dev`
Expected: `Ready in ...`. Открыть `http://localhost:3000/api/auth/providers` — должен вернуться JSON с `credentials` провайдером (без ошибок 500).
Открыть `http://localhost:3000/app` — должен сделать redirect на `/login?next=/app`. Страницы `/login` пока нет (404 содержимого ок, главное — редирект происходит).
Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add auth.ts app/api/ middleware.ts
git commit -m "feat(auth): next-auth v5 with credentials provider and /app middleware gate"
```

---

## Task 8: Register page и server action

**Files:**
- Create: `app/(auth)/register/page.tsx`, `app/(auth)/register/actions.ts`

- [ ] **Step 1: Создать `app/(auth)/register/actions.ts`**

```ts
'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { signIn } from '@/auth'

const schema = z.object({
  email: z.string().email('Введите корректный email').max(254).transform((s) => s.toLowerCase().trim()),
  name: z.string().min(1, 'Имя обязательно').max(80),
  password: z.string().min(8, 'Пароль не короче 8 символов').max(200),
})

export type RegisterState = { error?: string } | null

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Некорректные данные' }
  }

  const { email, name, password } = parsed.data
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) return { error: 'Пользователь с таким email уже зарегистрирован' }

  const passwordHash = await hashPassword(password)
  await db.insert(users).values({ email, name, passwordHash })

  // авто-вход после регистрации — signIn делает redirect сам
  await signIn('credentials', { email, password, redirectTo: '/app' })
  redirect('/app')
}
```

- [ ] **Step 2: Создать `app/(auth)/register/page.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { registerAction, type RegisterState } from './actions'

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(registerAction, null)

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-md animate-fade-up">
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" name="name" required maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            {state?.error && (
              <p className="text-sm text-error">{state.error}</p>
            )}
            <Button type="submit" disabled={pending} size="lg" className="w-full">
              {pending ? 'Регистрируем…' : 'Создать аккаунт'}
            </Button>
            <p className="text-center text-sm text-neutral-600">
              Уже есть аккаунт? <Link className="text-brand-600 hover:underline" href="/login">Войти</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 3: Проверить регистрацию вручную**

Run: `pnpm dev`
Открыть `http://localhost:3000/register`.
Заполнить форму (`test@example.com`, `Тестовый Учитель`, `password123`), Submit.
Expected: редирект на `/app` (пустая страница может пока 404 — нормально, /app мы добавим в задаче 10).
Проверить в БД:
Run: `docker exec kc-postgres psql -U kc -d kc -c "SELECT email, name FROM users;"`
Expected: одна запись с введённым email.
Ctrl-C dev-сервер.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/register/
git commit -m "feat(auth): register page with server action and auto-login"
```

---

## Task 9: Login page

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`

- [ ] **Step 1: Создать `app/(auth)/login/actions.ts`**

```ts
'use server'

import { z } from 'zod'
import { AuthError } from 'next-auth'
import { signIn } from '@/auth'

const schema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
})

export type LoginState = { error?: string } | null

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'Введите корректные данные' }

  const next = String(formData.get('next') ?? '/app')

  try {
    await signIn('credentials', { ...parsed.data, redirectTo: next })
    return null
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: 'Неверный email или пароль' }
    }
    throw e
  }
}
```

- [ ] **Step 2: Создать `app/(auth)/login/page.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { loginAction, type LoginState } from './actions'

export default function LoginPage() {
  const params = useSearchParams()
  const next = params.get('next') ?? '/app'
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, null)

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-md animate-fade-up">
        <CardHeader>
          <CardTitle>Вход</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {state?.error && (
              <p className="text-sm text-error">{state.error}</p>
            )}
            <Button type="submit" disabled={pending} size="lg" className="w-full">
              {pending ? 'Входим…' : 'Войти'}
            </Button>
            <p className="text-center text-sm text-neutral-600">
              Нет аккаунта? <Link className="text-brand-600 hover:underline" href="/register">Регистрация</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 3: Проверить вход вручную**

Run: `pnpm dev`
Открыть `http://localhost:3000/login`, ввести email/пароль из задачи 8.
Expected: редирект на `/app` (содержимое страницы появится в задаче 10).
Попробовать неверный пароль — expected: остаёмся на `/login`, сообщение «Неверный email или пароль».
Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/login/
git commit -m "feat(auth): login page with credentials"
```

---

## Task 10: Защищённый `/app`-шелл с Navbar

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `components/nav/AppNavbar.tsx`, `app/(app)/logout/route.ts`

- [ ] **Step 1: Создать `app/(app)/logout/route.ts`** (POST → signOut → redirect)

```ts
import { NextResponse } from 'next/server'
import { signOut } from '@/auth'

export async function POST() {
  await signOut({ redirect: false })
  return NextResponse.redirect(new URL('/', process.env.AUTH_URL ?? 'http://localhost:3000'))
}
```

- [ ] **Step 2: Создать `components/nav/AppNavbar.tsx`** (server component с form для logout)

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function AppNavbar({ userName, userEmail }: { userName?: string | null; userEmail: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-50/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/app" className="text-base font-display font-semibold text-neutral-900">
          Классный час
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">{userName ?? userEmail}</span>
          <form action="/app/logout" method="post">
            <Button type="submit" variant="outline" size="sm">Выйти</Button>
          </form>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Создать `app/(app)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AppNavbar } from '@/components/nav/AppNavbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen">
      <AppNavbar userName={session.user.name} userEmail={session.user.email!} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Создать `app/(app)/page.tsx`** (заглушка дашборда)

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-neutral-900">Добро пожаловать</h1>
      <p className="text-neutral-600 max-w-prose">
        Здесь появится создание сценариев, библиотека сообщества, календарь и загруженные планы.
        Сейчас — фундамент готов.
      </p>
      <Card>
        <CardHeader><CardTitle>Скоро</CardTitle></CardHeader>
        <CardContent className="text-sm text-neutral-600">
          <ul className="list-disc pl-5 space-y-1">
            <li>Генератор сценариев классных часов и квизов</li>
            <li>Загрузка плана воспитательной работы</li>
            <li>Библиотека сообщества</li>
            <li>Экспорт в PDF / DOCX</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Проверить end-to-end вручную**

Run: `pnpm dev`
- `http://localhost:3000/app` → должно редиректить на /login (если вышел) или показать дашборд (если залогинен).
- Войти — увидеть Navbar с именем и кнопкой «Выйти».
- Нажать «Выйти» — должно отправить на `/`.
Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/ components/nav/
git commit -m "feat(app): protected /app layout with navbar and logout"
```

---

## Task 11: Biome — линтер и форматтер

**Files:**
- Create: `biome.json`

- [ ] **Step 1: Создать `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["node_modules", ".next", "db/migrations", "coverage"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "asNeeded"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "warn" },
      "style": { "useImportType": "warn" }
    }
  }
}
```

- [ ] **Step 2: Прогнать lint**

Run: `pnpm lint`
Expected: возможны warnings (any), не должно быть errors. Если есть errors — поправить (обычно мелкие импорты).

- [ ] **Step 3: Прогнать format**

Run: `pnpm format`
Expected: файлы переформатированы, diff может быть. Просмотреть и закоммитить.

- [ ] **Step 4: Commit**

```bash
git add biome.json $(git diff --name-only)
git commit -m "chore: biome linter and formatter, apply initial formatting"
```

---

## Task 12: README с инструкциями

**Files:**
- Create: `README.md`

- [ ] **Step 1: Создать `README.md`**

```markdown
# Классный час — ИИ-генератор сценариев внеурочки

Хакатонный MVP. Генерирует структурированные сценарии классных часов, квизов, бесед и мастерских с опорой на методички и лайки сообщества.

## Требования

- Node 20+
- pnpm 9+
- Docker (для Postgres+pgvector)

## Быстрый старт

```bash
cp .env.example .env.local
# заполнить AUTH_SECRET (openssl rand -base64 32) и опционально GIGACHAT_*

pnpm install
pnpm db:up           # поднять Postgres+pgvector
pnpm db:migrate      # применить миграции
pnpm dev             # http://localhost:3000
```

## Скрипты

| Скрипт | Что делает |
|---|---|
| `pnpm dev` | Dev-сервер на :3000 |
| `pnpm build` | Production build |
| `pnpm test` | Unit + integration через Vitest |
| `pnpm lint` | Biome check |
| `pnpm format` | Biome format |
| `pnpm db:up` / `db:down` | Postgres контейнер |
| `pnpm db:generate` | Сгенерировать миграцию из `db/schema.ts` |
| `pnpm db:migrate` | Применить миграции |
| `pnpm db:studio` | Drizzle Studio (просмотр БД) |

## Текущий статус

Plan 1 (Foundation) — готов. Регистрация, вход, защищённый `/app`-шелл.
Следующее: Plan 2 — генерация v0 single-shot.

## Документы

- Spec: `docs/superpowers/specs/2026-05-20-klassniy-chas-design.md`
- Plans: `docs/superpowers/plans/`
- Brief кейса: `klassniy-chas-brief.md`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup and scripts"
```

---

## Task 13: Smoke-тест (sanity check всего стека)

**Files:**
- Create: `tests/smoke/db.test.ts`

- [ ] **Step 1: Написать smoke-тест**

```ts
import { describe, expect, it } from 'vitest'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

describe('smoke', () => {
  it('connects to the database', async () => {
    const result = await db.execute(sql`SELECT 1 as ok`)
    expect(result.length).toBeGreaterThan(0)
    expect((result[0] as { ok: number }).ok).toBe(1)
  })

  it('pgvector extension is available', async () => {
    const result = await db.execute(
      sql`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector') AS has_vector`,
    )
    expect((result[0] as { has_vector: boolean }).has_vector).toBe(true)
  })
})
```

- [ ] **Step 2: Прогнать тесты**

Сначала убедиться что БД запущена.
Run: `pnpm test`
Expected: все тесты PASS (password.test.ts + smoke/db.test.ts).

Если `has_vector` = false:
Run: `docker exec kc-postgres psql -U kc -d kc -c "CREATE EXTENSION IF NOT EXISTS vector;"`
Затем повторить `pnpm test`.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke/
git commit -m "test: db connection and pgvector smoke tests"
```

---

## Task 14: Финальная проверка фазы

**Цель:** убедиться что весь стек поднимается с нуля и работает.

- [ ] **Step 1: Полный reset и пересборка**

```bash
pnpm db:down
docker volume rm planwise_kc-pgdata 2>/dev/null || true
rm -rf .next node_modules
pnpm install
pnpm db:up
sleep 5  # дождаться healthcheck
pnpm db:migrate
pnpm test
pnpm build
```
Expected: каждый шаг проходит без ошибок.

- [ ] **Step 2: Smoke E2E вручную**

```bash
pnpm dev
```
- Открыть `http://localhost:3000` — лендинг
- `/register` — зарегистрировать `demo@kc.local` / `Демо` / `password123`
- Должен быть редирект на `/app`
- Нажать «Выйти» → редирект на `/`
- `/login` с тем же email/паролем → `/app`
- В БД: `docker exec kc-postgres psql -U kc -d kc -c "SELECT email FROM users;"` — есть запись

Ctrl-C.

- [ ] **Step 3: Тег milestone**

```bash
git tag -a foundation-done -m "Plan 1 complete: foundation ready"
```

- [ ] **Step 4: Записать результат**

```bash
git log --oneline foundation-done~14..foundation-done > docs/superpowers/plans/2026-05-20-plan-1-foundation.log
git add docs/superpowers/plans/2026-05-20-plan-1-foundation.log
git commit -m "docs: log commits for plan 1"
```

---

## Success Criteria (план 1 считается выполненным, если)

- [ ] `pnpm install && pnpm db:up && pnpm db:migrate && pnpm dev` поднимает рабочую систему с нуля
- [ ] Лендинг `/` рендерится с дизайн-токенами из design_example
- [ ] `/register` создаёт пользователя в `users` с bcrypt hash
- [ ] `/login` проверяет пароль и пускает в `/app`
- [ ] `/app/*` за auth-walls (анон → redirect /login)
- [ ] Выход работает через POST `/app/logout`
- [ ] `pnpm test` зелёный (4 теста паролей + 2 smoke)
- [ ] `pnpm lint` без errors
- [ ] `pnpm build` собирает production bundle без ошибок
- [ ] pgvector расширение установлено в БД
- [ ] Все коммиты атомарные, каждая задача = отдельный коммит

## Что **не** делаем в этом плане (явно)

- Email-верификация (только в Plan 8 если останется время)
- Восстановление пароля
- OAuth провайдеры
- Любой UI кроме auth и пустого дашборда
- Любые таблицы кроме `users/accounts/sessions/verification_tokens`
- Любые скрипты/инжесты
- Расширение схемы под scenarios/likes/rag_* — это Plan 2 и далее

---

## После выполнения

Запустить `superpowers:subagent-driven-development` или `superpowers:executing-plans` для Plan 2 (generation v0 single-shot).
