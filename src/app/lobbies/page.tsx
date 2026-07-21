import type { Metadata } from 'next'
import { Barlow_Semi_Condensed, Fraunces } from 'next/font/google'
import { LobbyBrowser } from '~/components/mp/lobby-browser'
import '~/components/theme.css'

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
  title: 'Brass: Birmingham — open tables',
  robots: { index: false, follow: false },
}

export default function LobbiesPage() {
  return (
    <div className={`bb2 bb2-canvas ${display.variable} ${body.variable}`}>
      <LobbyBrowser />
    </div>
  )
}
