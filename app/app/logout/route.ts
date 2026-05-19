import { NextResponse } from 'next/server'
import { signOut } from '@/auth'

export async function POST() {
  await signOut({ redirect: false })
  return NextResponse.redirect(new URL('/', process.env.AUTH_URL ?? 'http://localhost:3000'))
}
