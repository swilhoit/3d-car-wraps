import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Inter } from 'next/font/google'
import { CacheCleaner } from '@/components/CacheCleaner'
import type { AppProps } from 'next/app'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} font-sans`}>
      <AuthProvider>
        <Component {...pageProps} />
        <CacheCleaner />
      </AuthProvider>
    </div>
  )
}