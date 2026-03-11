// app/layout.tsx
// Minimal layout — ClerkProvider wraps the app for API route auth.
// The actual UI is served by app/route.ts (raw HTML from public/app.html).

import { ClerkProvider } from '@clerk/nextjs'
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {children}
      <Analytics />
    </ClerkProvider>
  )
}
