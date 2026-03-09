// app/layout.tsx
import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'

export const metadata: Metadata = {
  title: 'SwiftsReader — Academic Reader for ADHD & Dyslexic Minds',
  description: 'Fast, focused, unstoppable. RSVP reading, AI summaries, and dyslexia modes designed for academic researchers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
