import { auth } from '@/auth'
import { AppNavbar } from '@/components/nav/AppNavbar'
import { getDailyGenerationUsage } from '@/lib/ratelimit/usage'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const usage = await getDailyGenerationUsage(
    session.user.id as string,
    session.user.email,
    session.user.role,
  )

  return (
    <div className="min-h-screen">
      <AppNavbar
        userName={session.user.name}
        userEmail={session.user.email ?? ''}
        role={session.user.role}
        usage={usage}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
