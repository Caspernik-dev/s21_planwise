import { signOut } from '@/auth'
import { baseUrlFromRequest } from '@/lib/auth/base-url'
import { assertSameOrigin } from '@/lib/auth/origin'
import { NextResponse } from 'next/server'

export async function POST() {
  if (!(await assertSameOrigin())) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 })
  }
  await signOut({ redirect: false })
  const base = await baseUrlFromRequest()
  return NextResponse.redirect(new URL('/', base))
}
