import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function Cta() {
  return (
    <section className="bg-neutral-0 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand-500 px-6 py-14 text-center shadow-brand sm:px-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 85% 15%, #ffffff 0%, transparent 45%)',
            }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Готовы сэкономить вечер на подготовке?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-brand-50">
              Создайте первый сценарий классного часа прямо сейчас — это бесплатно.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-0 px-7 py-3 text-base font-semibold text-brand-700 shadow-card transition-colors hover:bg-neutral-50"
              >
                Создать первый сценарий
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
