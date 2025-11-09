import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getPublishedScene, incrementSceneViews, verifyScenePassword } from '@/lib/firebase/publishedScenes';
import PasswordPrompt from '@/components/PasswordPrompt';
import Header from '@/components/Header';

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

export default function ViewScene() {
  const router = useRouter();
  const { id } = router.query;
  const [scene, setScene] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (id) {
      loadScene(id);
    }
  }, [id]);

  const loadScene = async (sceneId) => {
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

  const handlePasswordSubmit = async (password) => {
    if (!scene) return;

    const isValid = verifyScenePassword(scene, password);

    if (isValid) {
      setIsAuthenticated(true);
      setRequiresPassword(false);
      setPasswordError('');

      // Increment view count after successful authentication
      await incrementSceneViews(id);
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
      <Header />
      <div className="fixed inset-0 bg-black pt-[80px]">
        <SceneViewer scene={scene} />

        {/* Minimal UI overlay */}
        <div className="absolute top-4 left-4 bg-black/50 backdrop-blur rounded-lg p-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h1 className="text-white font-semibold">{scene.title}</h1>
            {scene.description && (
              <p className="text-gray-300 text-sm mt-1">{scene.description}</p>
            )}
          </div>
          {scene.isPasswordProtected && (
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