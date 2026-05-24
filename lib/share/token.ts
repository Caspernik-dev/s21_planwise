import { randomBytes } from 'node:crypto'

// Неугадываемый url-safe токен (24 байта ≈ 192 бита энтропии).
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url')
}
