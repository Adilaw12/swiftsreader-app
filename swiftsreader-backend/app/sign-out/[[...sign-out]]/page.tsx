'use client'
import { useEffect } from 'react'
import { useClerk } from '@clerk/nextjs'

export default function SignOutPage() {
  const { signOut } = useClerk()

  useEffect(() => {
    signOut({ redirectUrl: '/' })
  }, [signOut])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d0d1a',
      color: '#ffffff',
      fontFamily: 'sans-serif',
    }}>
      Signing out…
    </div>
  )
}
