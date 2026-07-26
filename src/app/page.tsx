import type { Metadata } from 'next'
import { Barlow_Semi_Condensed, Fraunces } from 'next/font/google'
import { Game } from '~/components/game'
import '~/components/theme.css'
import { aiOpponentsAvailableFromEnv } from '~/lib/features'

const display = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-bb-display',
})

const body = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bb-body',
})

export const metadata: Metadata = {
  title: 'Brass: Birmingham',
  description: 'The Ironmaster’s Atlas — a hotseat table for Brass: Birmingham',
}

// The charter must know whether the server can seat AI rivals by the time it is
// first painted — a flag that lands afterwards adds a third mode button and
// reflows the row under the player's finger. Rendering per request keeps that
// answer current: a prerendered one would freeze at build time and hide the
// mode on a deployment whose key was configured later.
export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <div className={`bb2 bb2-canvas ${display.variable} ${body.variable}`}>
      <Game aiOpponentsAvailable={aiOpponentsAvailableFromEnv()} />
    </div>
  )
}
