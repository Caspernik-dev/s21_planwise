import { auth } from '@/auth'
import { AppNavbar } from '@/components/nav/AppNavbar'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen">
      <AppNavbar
        userName={session.user.name}
        userEmail={session.user.email ?? ''}
        role={session.user.role}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
