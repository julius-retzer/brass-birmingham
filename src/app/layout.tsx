import { Analytics } from '@vercel/analytics/next'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Brass Birmingham',
  description: 'A digital implementation of Brass Birmingham board game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {children}
        {/* Vercel Web Analytics. Off Vercel (local dev, offline e2e) the
            component renders a script that no-ops, so it costs nothing and
            needs no env var. Collection ALSO requires Web Analytics to be
            enabled on the project dashboard — the package alone is inert. */}
        <Analytics />
      </body>
    </html>
  )
}
