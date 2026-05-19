import { signOut } from '@/auth'
import { NextResponse } from 'next/server'

export async function POST() {
  await signOut({ redirect: false })
  return NextResponse.redirect(new URL('/', process.env.AUTH_URL ?? 'http://localhost:3000'))
}
