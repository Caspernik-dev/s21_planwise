import { config } from 'dotenv'

// Грузим .env.local, чтобы интеграционные тесты (smoke/db) видели DATABASE_URL.
// Юнит-тесты, которые сами выставляют process.env в beforeEach, не затрагиваются
// (dotenv по умолчанию не перезаписывает уже заданные переменные).
config({ path: '.env.local' })
