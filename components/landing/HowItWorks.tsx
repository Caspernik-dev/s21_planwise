import { Cpu, FileEdit, SlidersHorizontal } from 'lucide-react'

const STEPS = [
  {
    icon: SlidersHorizontal,
    title: 'Задайте тему и контекст',
    description:
      'Направление, класс, формат и длительность. Тему можно ввести вручную, взять из плана воспитательной работы или из календаря поводов.',
  },
  {
    icon: Cpu,
    title: 'ИИ генерирует с опорой на методички',
    description:
      'Система находит релевантные материалы, обезличивает данные и собирает сценарий по блокам в реальном времени.',
  },
  {
    icon: FileEdit,
    title: 'Отредактируйте, проведите и экспортируйте',
    description:
      'Поправьте блоки, проведите занятие в режиме показа и выгрузите в PDF, DOCX или поделитесь ссылкой.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="bg-neutral-50 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <span className="inline-block rounded-full bg-brand-50 px-4 py-1 text-sm font-semibold text-brand-600 ring-1 ring-brand-200">
            Как работает
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            Три простых шага
          </h2>
        </div>

        <div className="relative">
          <div className="absolute left-1/2 top-12 hidden h-0.5 w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-brand-200 to-transparent lg:block" />

          <div className="grid gap-8 lg:grid-cols-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="relative flex flex-col items-center text-center">
                  <div className="relative mb-5">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-0 shadow-card ring-1 ring-neutral-200">
                      <Icon size={32} className="text-brand-500" />
                    </div>
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mb-2 font-display text-lg font-bold text-neutral-900">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-500">{step.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
