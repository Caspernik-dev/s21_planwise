import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true'
const MAINTENANCE_ALLOWLIST = new Set(
  (process.env.MAINTENANCE_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
)

export default auth((req) => {
  const isApp = req.nextUrl.pathname.startsWith('/app')
  if (!isApp) return NextResponse.next()

  const isAuthed = !!req.auth
  if (!isAuthed) {
    const url = new URL('/login', req.nextUrl)
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (MAINTENANCE_MODE) {
    const email = (req.auth?.user?.email ?? '').toLowerCase()
    const role = req.auth?.user?.role
    const allowed = role === 'admin' || MAINTENANCE_ALLOWLIST.has(email)
    if (!allowed) {
      return NextResponse.redirect(new URL('/maintenance', req.nextUrl))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/app/:path*'],
}
