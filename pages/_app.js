import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
})

export default function App({ Component, pageProps }) {
  return (
    <div className={`${inter.variable} font-sans`}>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </div>
  )
}