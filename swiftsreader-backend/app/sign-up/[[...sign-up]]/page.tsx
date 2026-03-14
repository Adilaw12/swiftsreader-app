import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d0d1a',
    }}>
      <SignUp
        appearance={{
          variables: {
            colorPrimary: '#00bcd4',
            colorBackground: '#1a1a2e',
            colorText: '#ffffff',
            colorInputBackground: '#16213e',
            colorInputText: '#ffffff',
            borderRadius: '12px',
          }
        }}
        fallbackRedirectUrl="/app"
        signInUrl="/sign-in"
      />
    </div>
  )
}
