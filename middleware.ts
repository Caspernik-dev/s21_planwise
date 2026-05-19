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
