import dynamic from 'next/dynamic'
import Head from 'next/head'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Header from '@/components/Header'
import TextureManager, { Texture, TextureManagerHandle } from '@/components/TextureManager'
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

type SaveAITextureFunction = (base64: string, name: string) => Promise<string>;

export default function Home() {
  const { user, loading } = useAuth()
  const [currentTexture, setCurrentTexture] = useState<string | null>(null)
  const textureManagerRef = useRef<TextureManagerHandle>(null)
  const [saveAITexture, setSaveAITexture] = useState<SaveAITextureFunction | null>(null)
  const [userTextures, setUserTextures] = useState<Texture[]>([])
  const [texturesLoaded, setTexturesLoaded] = useState(false); // New state
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Debug logging for texture updates
  // useEffect(() => {
  //   console.log('🎨 User textures updated in index.js:', {
  //     count: userTextures.length,
  //     textures: userTextures.map(t => ({ id: t.id, name: t.name, url: t.url?.substring(0, 50) + '...' }))
  //   })
  // }, [userTextures])

  // Handle the save AI texture callback properly
  const handleSaveAITexture = useCallback((saveFn: SaveAITextureFunction | null) => {
    setSaveAITexture(() => saveFn)
  }, [])

  // Handle textures loaded callback - memoize to prevent infinite re-renders
  const handleTexturesLoaded = useCallback((textures: Texture[]) => {
    setUserTextures(textures);
    setTexturesLoaded(true);
  }, [])

  // Check if user is authenticated
  useEffect(() => {
    if (!loading && !user) {
      setShowAuthModal(true)
    } else {
      setShowAuthModal(false)
    }
  }, [user, loading])

  // Render loading overlay if needed, but always mount TextureManager when user is authenticated
  const showLoadingOverlay = loading || (user && !texturesLoaded);

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
      <Head>
        <title>Waymo Wraps Designer & 3D Visualizer</title>
        <meta name="description" content="Professional 3D design tool for creating interactive visualizations. Design, customize, and share stunning 3D models with our intuitive editor." />
        <meta name="keywords" content="3d design, interactive design, 3d modeling, design tool, visualization, 3d editor, custom designs" />
        <meta name="author" content="3D Design Studio" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />

        {/* Canonical URL */}
        <link rel="canonical" href={typeof window !== 'undefined' ? window.location.origin : ''} />

        {/* Open Graph meta tags for social media sharing */}
        <meta property="og:title" content="3D Design Studio - Create Interactive 3D Designs" />
        <meta property="og:description" content="Professional 3D design tool for creating interactive visualizations. Design, customize, and share stunning 3D models with our intuitive editor." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={typeof window !== 'undefined' ? window.location.origin : ''} />
        <meta property="og:site_name" content="3D Design Studio" />
        <meta property="og:image" content="/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:image:alt" content="3D Design Studio - Interactive 3D Design Tool" />

        {/* Twitter Card meta tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@3ddesignstudio" />
        <meta name="twitter:title" content="3D Design Studio - Create Interactive 3D Designs" />
        <meta name="twitter:description" content="Professional 3D design tool for creating interactive visualizations. Design, customize, and share stunning 3D models." />
        <meta name="twitter:image" content="/og-image.jpg" />
        <meta name="twitter:image:alt" content="3D Design Studio - Interactive 3D Design Tool" />

        {/* Additional meta tags for better SEO */}
        <meta name="robots" content="index, follow" />
        <meta name="theme-color" content="#000000" />

        {/* Schema.org structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "3D Design Studio",
              "description": "Professional 3D design tool for creating interactive visualizations and 3D models",
              "url": typeof window !== 'undefined' ? window.location.origin : '',
              "applicationCategory": "DesignApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "creator": {
                "@type": "Organization",
                "name": "3D Design Studio"
              }
            })
          }}
        />
      </Head>
      <Header />
      <TextureManager
        ref={textureManagerRef}
        onTextureSelect={setCurrentTexture}
        currentTexture={currentTexture}
        onSaveAITexture={handleSaveAITexture}
        onTexturesLoaded={handleTexturesLoaded}
        userId={user?.uid || undefined}
      />
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#111',
        transition: 'colors 300ms'
      }}>
        {texturesLoaded && ( // Conditionally render ChromeModel
          <ChromeModel
            currentTexture={currentTexture}
            onSaveAITexture={saveAITexture}
            onUploadTextureImages={async (base64, name, editorState, thumbnailBase64) => {
              if (textureManagerRef.current && typeof textureManagerRef.current.uploadTextureImages === 'function') {
                return await textureManagerRef.current.uploadTextureImages(base64, name, editorState, thumbnailBase64)
              } else {
                console.error('TextureManager ref not ready or uploadTextureImages not available', textureManagerRef.current)
                throw new Error('TextureManager not ready')
              }
            }}
            userTextures={userTextures}
            onTextureSelect={setCurrentTexture}
            onDeleteUserTexture={async (textureId) => {
              if (textureManagerRef.current && typeof textureManagerRef.current.deleteTexture === 'function') {
                await textureManagerRef.current.deleteTexture(textureId)
              } else {
                console.error('TextureManager ref not ready or deleteTexture not available', textureManagerRef.current)
              }
            }}
            onRenameUserTexture={async (textureId, newName) => {
              if (textureManagerRef.current && typeof textureManagerRef.current.renameTexture === 'function') {
                await textureManagerRef.current.renameTexture(textureId, newName)
              } else {
                console.error('TextureManager ref not ready or renameTexture not available', textureManagerRef.current)
              }
            }}
            onUpdateTextureMetadata={async (textureId, data) => {
              if (textureManagerRef.current && typeof textureManagerRef.current.updateTextureMetadata === 'function') {
                await textureManagerRef.current.updateTextureMetadata(textureId, data)
              } else {
                console.error('TextureManager ref not ready or updateTextureMetadata not available', textureManagerRef.current)
              }
            }}
            userId={user?.uid || undefined}
            userEmail={user?.email || null}
          />
        )}
      </div>
      
      {/* Show loading overlay */}
      {showLoadingOverlay && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          zIndex: 9999
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
            <p>{loading ? 'Checking authentication...' : 'Loading your textures...'}</p>
            <style jsx>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      )}
    </>
  )
}

export async function getStaticProps() {
  return {
    props: {},
  }
}