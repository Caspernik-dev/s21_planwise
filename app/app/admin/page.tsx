import { auth } from '@/auth'
import { BarList } from '@/components/admin/BarList'
import { KpiCard } from '@/components/admin/KpiCard'
import { SectionCard } from '@/components/admin/SectionCard'
import { StatTable } from '@/components/admin/StatTable'
import { db } from '@/db'
import { successRate } from '@/lib/admin/format'
import { isAdmin } from '@/lib/admin/guard'
import {
  communityStats,
  contentStats,
  eventStats,
  generationStats,
  userStats,
} from '@/lib/admin/stats'
import { formatGrade } from '@/lib/scenario/options'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const session = await auth()
  if (!isAdmin(session && { user: { role: session.user.role } })) redirect('/app')

  const [gen, content, users, community, ev] = await Promise.all([
    generationStats(db),
    contentStats(db),
    userStats(db),
    communityStats(db),
    eventStats(db),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">Статистика</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Генераций всего" value={gen.total} />
        <KpiCard
          label="Успешных"
          value={`${successRate(gen.ok, gen.total)}%`}
          hint={`${gen.error} ошибок`}
        />
        <KpiCard
          label="Среднее время генерации"
          value={
            gen.avgLatencyFullMs == null ? '—' : `${(gen.avgLatencyFullMs / 1000).toFixed(1)} с`
          }
          hint="полная генерация сценария"
        />
        <KpiCard
          label="Среднее время 🎲-регенерации"
          value={
            gen.avgLatencyRegenMs == null ? '—' : `${(gen.avgLatencyRegenMs / 1000).toFixed(1)} с`
          }
          hint="замена одной активности"
        />
        <KpiCard
          label="Пользователей"
          value={users.totalUsers}
          hint={`${users.activeUsers} активны за 30д`}
        />
      </div>

      <SectionCard title="Генерации за 30 дней">
        <BarList items={gen.byDay.map((d) => ({ label: d.day, value: d.count }))} />
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Популярные темы">
          <StatTable
            columns={['Тема', 'Сценариев']}
            rows={content.topTopics.map((t) => ({ label: t.key, value: t.count }))}
          />
        </SectionCard>
        <SectionCard title="По направлению">
          <BarList items={content.byDirection.map((t) => ({ label: t.key, value: t.count }))} />
        </SectionCard>
        <SectionCard title="По классу">
          <BarList
            items={content.byGrade.map((t) => ({
              label: formatGrade(Number(t.key)),
              value: t.count,
            }))}
          />
        </SectionCard>
        <SectionCard title="По формату">
          <BarList items={content.byFormat.map((t) => ({ label: t.key, value: t.count }))} />
        </SectionCard>
        <SectionCard title="По длительности">
          <BarList
            items={content.byDuration.map((t) => ({ label: `${t.key} мин`, value: t.count }))}
          />
        </SectionCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Новые пользователи за 30 дней">
          <BarList items={users.newByDay.map((d) => ({ label: d.day, value: d.count }))} />
        </SectionCard>
        <SectionCard title="Топ пользователей по генерациям">
          <StatTable
            columns={['Email', 'Генераций']}
            rows={users.topUsers.map((u) => ({ label: u.email, value: u.count }))}
          />
        </SectionCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Сообщество">
          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Лайков" value={community.totalLikes} />
            <KpiCard label="Расшарено" value={community.totalShared} />
          </div>
          <div className="mt-4">
            <StatTable
              columns={['Сценарий', '❤']}
              rows={community.topShared.map((s) => ({ label: s.topic, value: s.likeCount }))}
            />
          </div>
          <p className="mt-3 text-sm text-neutral-500">
            Покрытие планов: {community.planCoverage.closed} из {community.planCoverage.total} тем
          </p>
        </SectionCard>
        <SectionCard title="События за 30 дней">
          <BarList items={ev.byType.map((t) => ({ label: t.key, value: t.count }))} />
          <div className="mt-4">
            <StatTable
              columns={['Поисковый запрос', 'Раз']}
              rows={ev.topSearches.map((s) => ({ label: s.key, value: s.count }))}
            />
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            Данные событий собираются с момента внедрения.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}
