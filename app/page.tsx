import { Audience } from '@/components/landing/Audience'
import { Cta } from '@/components/landing/Cta'
import { Features } from '@/components/landing/Features'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LandingNavbar } from '@/components/landing/LandingNavbar'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <LandingNavbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Audience />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}
