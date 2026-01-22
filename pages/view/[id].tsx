import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { GetServerSideProps } from 'next';
import { getPublishedScene, incrementSceneViews, verifyScenePassword, type PublishedScene } from '@/lib/firebase/publishedScenes';
import PasswordPrompt from '@/components/PasswordPrompt';
import Header from '@/components/Header';
import { DocumentData } from 'firebase/firestore';

// Dynamic import to avoid SSR issues
const SceneViewer = dynamic(() => import('@/components/SceneViewer'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-3 border-gray-700 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white">Loading 3D Scene...</p>
      </div>
    </div>
  )
});

interface SceneData extends DocumentData {
  // Define the shape of your scene data here
  // For example:
  title?: string;
  description?: string;
  isPasswordProtected?: boolean;
  sceneData: {
    // Core model settings
    texture: string | null;
    backgroundColor: string;
    backgroundImage: string | null;
    numberOfUnits: number;
    sceneRotation: { x: number; y: number; z: number };
    scenePosition: { x: number; y: number; z: number };

    // Camera settings
    cameraAngle?: string;
    cameraPosition?: { x: number; y: number; z: number };
    cameraTarget?: { x: number; y: number; z: number };

    // Animation settings
    isRotating?: boolean;
    rotationSpeed?: number;

    // Scene elements visibility
    showPerson?: boolean;
    showGroundPlane?: boolean;

    // Environment settings
    environmentPreset?: string;
    environmentIntensity?: number;
    backgroundIntensity?: number;

    // Lighting settings
    ambientLightIntensity?: number;
    ambientLightColor?: string;
    directionalLightIntensity?: number;
    directionalLightPosition?: { x: number; y: number; z: number };
    directionalLightColor?: string;
    hemisphereIntensity?: number;

    // Shadow settings
    shadowsEnabled?: boolean;
    shadowQuality?: number;
  };
}

interface ViewSceneProps {
  initialScene?: SceneData | null;
  sceneId: string;
}

export default function ViewScene({ initialScene, sceneId }: ViewSceneProps) {
  const router = useRouter();
  const { id } = router.query;
  const [scene, setScene] = useState<SceneData | null>(initialScene || null);
  const [loading, setLoading] = useState(!initialScene);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Only load scene if we don't have initial data and have an ID
    if (id && !initialScene) {
      loadScene(id as string);
    } else if (initialScene) {
      // If we have initial scene data, set it up
      setScene(initialScene);
      setLoading(false);

      // Check if scene is password protected
      if (initialScene.isPasswordProtected) {
        setRequiresPassword(true);
      } else {
        setIsAuthenticated(true);
        // Increment view count on client side
        incrementSceneViews(sceneId).catch(console.error);
      }
    }
  }, [id, initialScene, sceneId]);

  const loadScene = async (sceneId: string) => {
    try {
      const publishedScene = await getPublishedScene(sceneId);

      if (!publishedScene) {
        setError('Scene not found or has been removed');
        setLoading(false);
        return;
      }

      // Check if scene is password protected
      if (publishedScene.isPasswordProtected) {
        setRequiresPassword(true);
        setScene(publishedScene);
        setLoading(false);
        return;
      }

      setScene(publishedScene);
      setIsAuthenticated(true);

      // Debug: Log the scene data
      console.log('Loaded published scene:', publishedScene);
      console.log('Full scene data:', publishedScene.sceneData);
      console.log('Scene texture:', publishedScene.sceneData?.texture);
      console.log('Scene texture type:', typeof publishedScene.sceneData?.texture);

      // Increment view count
      await incrementSceneViews(sceneId);
    } catch (err) {
      console.error('Error loading scene:', err);
      setError('Failed to load scene');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-gray-700 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading Scene...</p>
        </div>
      </div>
    );
  }

  const handlePasswordSubmit = async (password: string) => {
    if (!scene) return;

    const isValid = verifyScenePassword(scene as PublishedScene, password);

    if (isValid) {
      setIsAuthenticated(true);
      setRequiresPassword(false);
      setPasswordError('');

      // Increment view count after successful authentication
      await incrementSceneViews(id as string);
    } else {
      setPasswordError('Incorrect password. Please try again.');
    }
  };

  if (requiresPassword && !isAuthenticated) {
    return (
      <PasswordPrompt
        onSubmit={handlePasswordSubmit}
        onCancel={() => router.push('/')}
        error={passwordError}
      />
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center max-w-md">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-white text-xl font-bold mb-2">Scene Not Found</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Head>
        <title>{scene?.title || 'Untitled Scene'} - Interactive 3D Design</title>
        <meta name="description" content={scene?.description || 'Experience this stunning interactive 3D design scene. Click and drag to explore in 3D!'} />
        <meta name="keywords" content="3d design, interactive, 3d model, visualization, design viewer, 3d scene" />
        <meta name="author" content="3D Design Studio" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />

        {/* Canonical URL */}
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/view/${scene?.id || sceneId || router.query.id}`} />

        {/* Open Graph meta tags for social media sharing */}
        <meta property="og:title" content={`${scene?.title || 'Untitled Scene'} - Interactive 3D Design`} />
        <meta property="og:description" content={scene?.description || 'Experience this stunning interactive 3D design scene. Click and drag to explore in 3D!'} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${typeof window !== 'undefined' ? window.location.origin : ''}/view/${scene?.id || sceneId || router.query.id}`} />
        <meta property="og:site_name" content="3D Design Studio" />
        {scene?.thumbnail && (
          <>
            <meta property="og:image" content={scene.thumbnail} />
            <meta property="og:image:width" content="512" />
            <meta property="og:image:height" content="512" />
            <meta property="og:image:type" content="image/jpeg" />
            <meta property="og:image:alt" content={`Preview of ${scene?.title || 'Interactive 3D Design'}`} />
          </>
        )}

        {/* Twitter Card meta tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@3ddesignstudio" />
        <meta name="twitter:creator" content="@3ddesignstudio" />
        <meta name="twitter:title" content={`${scene?.title || 'Untitled Scene'} - Interactive 3D Design`} />
        <meta name="twitter:description" content={scene?.description || 'Experience this stunning interactive 3D design scene. Click and drag to explore in 3D!'} />
        {scene?.thumbnail && (
          <>
            <meta name="twitter:image" content={scene.thumbnail} />
            <meta name="twitter:image:alt" content={`Preview of ${scene?.title || 'Interactive 3D Design'}`} />
          </>
        )}

        {/* Additional meta tags for better SEO */}
        <meta name="robots" content="index, follow" />
        <meta name="theme-color" content="#000000" />

        {/* Schema.org structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VisualArtwork",
              "name": scene?.title || 'Untitled Scene',
              "description": scene?.description || 'Interactive 3D design scene',
              "url": `${typeof window !== 'undefined' ? window.location.origin : ''}/view/${scene?.id || sceneId || router.query.id}`,
              "image": scene?.thumbnail,
              "artMedium": "Digital 3D",
              "artworkSurface": "Interactive Web Experience",
              "creator": {
                "@type": "Organization",
                "name": "3D Design Studio"
              }
            })
          }}
        />
      </Head>
      <Header />
      <div className="fixed inset-0 bg-black pt-[80px]">
        {scene && <SceneViewer scene={scene} />}

        {/* Minimal UI overlay */}
        <div className="absolute top-20 left-4 bg-black/50 backdrop-blur rounded-lg p-3 z-20">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h1 className="text-white font-semibold">{scene?.title || 'Untitled Scene'}</h1>
            {scene?.description && (
              <p className="text-gray-300 text-sm mt-1">{scene.description}</p>
            )}
          </div>
          {scene?.isPasswordProtected && (
            <div className="text-yellow-500" title="Password Protected">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      </div>
    </>
  );
}

// Server-side rendering to ensure meta tags are properly populated
export const getServerSideProps: GetServerSideProps<ViewSceneProps> = async (context) => {
  const { id } = context.params!;
  const sceneId = id as string;

  console.log('🔍 SSR DEBUG: Starting server-side props generation for sceneId:', sceneId);

  try {
    // Load scene data on the server for SEO/meta tags
    console.log('📡 SSR DEBUG: Fetching scene from Firestore...');
    const scene = await getPublishedScene(sceneId);

    if (!scene) {
      console.log('❌ SSR DEBUG: Scene not found in Firestore');
      return {
        notFound: true,
      };
    }

    console.log('✅ SSR DEBUG: Scene found!', {
      id: scene.id,
      title: scene.title,
      hasDescription: !!scene.description,
      hasThumbnail: !!scene.thumbnail,
      thumbnailUrl: scene.thumbnail,
      isActive: scene.isActive,
      views: scene.views
    });

    // Convert Firestore timestamps to serializable format
    const serializedScene = {
      ...scene,
      createdAt: (scene.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() || scene.createdAt,
      updatedAt: (scene.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() || scene.updatedAt,
      lastViewedAt: (scene.lastViewedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() || scene.lastViewedAt,
    };

    console.log('🔄 SSR DEBUG: Serialized scene data:', {
      id: serializedScene.id,
      title: serializedScene.title,
      description: serializedScene.description,
      thumbnail: serializedScene.thumbnail
    });

    return {
      props: {
        initialScene: serializedScene,
        sceneId,
      },
    };
  } catch (error) {
    console.error('❌ SSR DEBUG: Error loading scene for SSR:', error);

    // Return props for client-side loading if server-side fails
    return {
      props: {
        initialScene: null,
        sceneId,
      },
    };
  }
};