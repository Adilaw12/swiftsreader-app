import { redirect } from 'next/navigation'

// The SwiftsReader app is a self-contained HTML file served from /public/app.html.
// Redirecting here keeps the Next.js routing intact while serving the app at the root.
export default function Home() {
  redirect('/app.html')
}
