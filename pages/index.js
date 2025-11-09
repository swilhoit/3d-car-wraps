import dynamic from 'next/dynamic'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Header from '@/components/Header'
import TextureManager from '@/components/TextureManager'
import AuthModal from '@/components/AuthModal'
import Image from 'next/image'

// Dynamic imports to avoid SSR issues
const ChromeModel = dynamic(() => import('../components/ChromeModel'), {
  ssr: false,
  loading: () => (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000'
    }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid #000',
          borderTop: '3px solid #fff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 20px'
        }}></div>
        <p>Loading 3D Experience...</p>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
})


export default function Home() {
  const { user, loading } = useAuth()
  const [currentTexture, setCurrentTexture] = useState(null)
  const textureManagerRef = useRef(null)
  const [saveAITexture, setSaveAITexture] = useState(null)
  const [userTextures, setUserTextures] = useState([])
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Handle the save AI texture callback properly
  const handleSaveAITexture = useCallback((saveFn) => {
    setSaveAITexture(() => saveFn)
  }, [])

  // Check if user is authenticated
  useEffect(() => {
    if (!loading && !user) {
      setShowAuthModal(true)
    } else {
      setShowAuthModal(false)
    }
  }, [user, loading])

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000'
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '3px solid #000',
            borderTop: '3px solid #fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p>Checking authentication...</p>
          <style jsx>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    )
  }

  // Show auth modal if not authenticated
  if (!user) {
    return (
      <>
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ textAlign: 'center', color: 'white', padding: '20px' }}>
            {/* Logo - using Next Image exactly like Header component */}
            <div className="flex justify-center mb-8">
              <Image
                src="/coco-Logo-Full-square-w.png"
                alt="Logo"
                width={150}
                height={150}
                className="object-contain drop-shadow-2xl"
                priority
              />
            </div>
            <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Welcome to 3D Wrap Configurator</h1>
            <p style={{ marginBottom: '2rem', color: '#fff' }}>Please sign in to continue</p>
          </div>
        </div>
        <AuthModal
          isOpen={showAuthModal}
          requireAuth={true}
          onClose={() => {
            // Don't allow closing the modal if not authenticated
            if (user) {
              setShowAuthModal(false)
            }
          }}
        />
      </>
    )
  }

  // Show main app only when authenticated
  return (
    <>
      <Header />
      <TextureManager
        ref={textureManagerRef}
        onTextureSelect={setCurrentTexture}
        currentTexture={currentTexture}
        onSaveAITexture={handleSaveAITexture}
        onTexturesLoaded={setUserTextures}
        userId={user?.uid || null}
      />
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#111',
        transition: 'colors 300ms'
      }}>
        <ChromeModel
          currentTexture={currentTexture}
          onSaveAITexture={saveAITexture}
          userTextures={userTextures}
          onTextureSelect={setCurrentTexture}
          onDeleteUserTexture={async (textureId) => {
            if (textureManagerRef.current && typeof textureManagerRef.current.deleteTexture === 'function') {
              await textureManagerRef.current.deleteTexture(textureId)
            } else {
              console.error('TextureManager ref not ready or deleteTexture not available', textureManagerRef.current)
            }
          }}
          userId={user?.uid || null}
          userEmail={user?.email || null}
        />
      </div>
    </>
  )
}

export async function getStaticProps() {
  return {
    props: {},
  }
}