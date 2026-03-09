// Skip static prerendering — ClerkProvider in layout requires dynamic runtime.
export const dynamic = 'force-dynamic'

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h1>404 — Page Not Found</h1>
        <p><a href="/">Go home</a></p>
      </body>
    </html>
  )
}
