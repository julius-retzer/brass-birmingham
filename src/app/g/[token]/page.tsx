import type { Metadata } from 'next'
import { Barlow_Semi_Condensed, Fraunces } from 'next/font/google'
import { MpGame } from '~/components/v2/mp/mp-game'
import '~/components/v2/theme.css'

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
  title: 'Brass: Birmingham — online game',
  robots: { index: false, follow: false },
}

export default async function OnlineGamePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <div className={`bb2 bb2-canvas ${display.variable} ${body.variable}`}>
      <MpGame token={token} />
    </div>
  )
}
