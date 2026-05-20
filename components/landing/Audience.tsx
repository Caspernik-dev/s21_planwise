import { ClipboardList, GraduationCap, Users } from 'lucide-react'

const AUDIENCE = [
  {
    icon: GraduationCap,
    title: 'Классные руководители',
    description:
      'Готовый сценарий внеурочного занятия без долгой подготовки — больше времени на учеников.',
    color: 'bg-brand-50 text-brand-600',
    ring: 'ring-brand-200',
  },
  {
    icon: Users,
    title: 'Советники по воспитанию',
    description:
      'Сценарии в логике «Разговоров о важном» с опорой на актуальные методические материалы.',
    color: 'bg-accent-50 text-accent-600',
    ring: 'ring-accent-200',
  },
  {
    icon: ClipboardList,
    title: 'Педагоги-организаторы',
    description:
      'Беседы, квизы и игры под нужный класс и формат — быстро собрать и адаптировать под событие.',
    color: 'bg-warm-50 text-warm-600',
    ring: 'ring-warm-200',
  },
]

export function Audience() {
  return (
    <section id="audience" className="bg-neutral-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            Для кого
          </h2>
          <p className="mt-3 text-base text-neutral-500">
            Тем, кто проводит классные часы и внеурочные занятия
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {AUDIENCE.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className={`rounded-2xl bg-neutral-0 p-6 shadow-card ring-1 transition-shadow hover:shadow-hover ${item.ring}`}
              >
                <div className={`mb-4 inline-flex rounded-xl p-3 ${item.color}`}>
                  <Icon size={24} />
                </div>
                <h3 className="mb-2 font-display text-xl font-bold text-neutral-900">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-500">{item.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
