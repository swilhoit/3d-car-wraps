'use client';

import { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { logOut } from '@/lib/firebase/auth';
import { uploadTexture } from '@/lib/firebase/storage';
import { saveTexture, getUserTextures, deleteTexture } from '@/lib/firebase/firestore';
import { base64ToBlob } from '@/lib/firebase/utils';
import AuthModal from './AuthModal';
import { ConfirmModal, AlertModal } from './CustomModal';
import PublishedScenesModal from './PublishedScenesModal';

export interface Texture {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  isAIGenerated?: boolean;
  createdAt?: unknown;
}

interface TextureManagerProps {
  onTextureSelect: (textureUrl: string) => void;
  currentTexture?: string | null;
  onSaveAITexture?: (saveFunction: ((base64: string, name: string) => Promise<string>) | null) => void;
  onTexturesLoaded?: (textures: Texture[]) => void;
  userId?: string;
}

export interface TextureManagerHandle {
  saveAIGeneratedTexture: (base64: string, name: string, prompt?: string) => Promise<string>;
  deleteTexture: (textureId: string) => Promise<void>;
}

const TextureManager = forwardRef<TextureManagerHandle, TextureManagerProps>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ onTextureSelect, onSaveAITexture, onTexturesLoaded, userId }, ref) => {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userTextures, setUserTextures] = useState<Texture[]>([]);
  // const [uploadingTexture, setUploadingTexture] = useState(false); // Reserved for future use
  // const [loadingTextures, setLoadingTextures] = useState(false); // Reserved for future use
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showPublishedScenesModal, setShowPublishedScenesModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; textureId?: string }>({ isOpen: false });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, message: '', type: 'info' });

  // Load user textures when authenticated
  useEffect(() => {
    const loadTextures = async () => {
      if (!user) {
        setUserTextures([]);
        if (onTexturesLoaded) onTexturesLoaded([]);
        return;
      }

      // setLoadingTextures(true);
      try {
        const textures = await getUserTextures(user.uid);
        setUserTextures(textures as Texture[]);
        if (onTexturesLoaded) onTexturesLoaded(textures as Texture[]);
      } catch (error) {
        console.error('Error loading textures:', error);
        // Handle index building error gracefully
        const err = error as { code?: string; message?: string };
        if (err?.code === 'failed-precondition' && err?.message?.includes('index')) {
          console.log('Firestore index is still building. Textures will be available shortly.');
          // Don't show an error to the user, just use empty array
          setUserTextures([]);
          if (onTexturesLoaded) onTexturesLoaded([]);
        }
      } finally {
        // setLoadingTextures(false);
      }
    };

    if (user) {
      loadTextures();
    } else {
      setUserTextures([]);
      if (onTexturesLoaded) onTexturesLoaded([]);
    }
  }, [user, onTexturesLoaded]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAccountMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.account-menu') && !target.closest('.account-toggle')) {
          setShowAccountMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu]);

  const loadUserTextures = async () => {
    if (!user) return;

    // setLoadingTextures(true);
    try {
      const textures = await getUserTextures(user.uid);
      setUserTextures(textures as Texture[]);
      if (onTexturesLoaded) onTexturesLoaded(textures as Texture[]);
    } catch (error) {
      console.error('Error loading textures:', error);
      // Handle index building error gracefully
      const err = error as { code?: string; message?: string };
      if (err?.code === 'failed-precondition' && err?.message?.includes('index')) {
        console.log('Firestore index is still building. Textures will be available shortly.');
        // Don't show an error to the user, just use empty array
        setUserTextures([]);
        if (onTexturesLoaded) onTexturesLoaded([]);
      }
    } finally {
      // setLoadingTextures(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      setUserTextures([]);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const saveAIGeneratedTexture = useCallback(async (base64: string, name: string, prompt?: string): Promise<string> => {
    if (!user) {
      console.log('User not authenticated, showing auth modal');
      setShowAuthModal(true);
      throw new Error('User must be authenticated to save textures');
    }

    try {
      // Convert base64 to blob
      const blob = base64ToBlob(base64);

      // Upload to Firebase Storage
      const textureUrl = await uploadTexture(user.uid, blob, `${name}.png`);

      // Save texture metadata to Firestore
      await saveTexture({
        userId: user.uid,
        name: name,
        url: textureUrl,
        thumbnailUrl: textureUrl,
        isAIGenerated: true,
        metadata: {
          prompt: prompt || 'AI Generated',
          generatedAt: new Date().toISOString(),
          generatedBy: user.email
        }
      });

      // Reload textures list
      await loadUserTextures();
      if (onTexturesLoaded) {
        const textures = await getUserTextures(user.uid);
        onTexturesLoaded(textures as Texture[]);
      }

      return textureUrl;
    } catch (error) {
      console.error('Error saving AI-generated texture:', error);
      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, setShowAuthModal, loadUserTextures]);

  // Create handleDeleteTexture as a callback - reserved for future use
  // const handleDeleteTexture = useCallback(async (textureId: string) => {
  //   setConfirmModal({ isOpen: true, textureId });
  // }, []);

  const performDelete = useCallback(async (textureId: string) => {

    try {
      await deleteTexture(textureId);
      // Update local state immediately for responsive UI
      setUserTextures(prev => prev.filter(t => t.id !== textureId));
      if (onTexturesLoaded) {
        const updatedTextures = userTextures.filter(t => t.id !== textureId);
        onTexturesLoaded(updatedTextures);
      }
      // Reload textures to ensure sync with database
      await loadUserTextures();
    } catch (error) {
      console.error('Error deleting texture:', error);
      setAlertModal({ isOpen: true, message: 'Failed to delete texture.', type: 'error' });
      // Reload in case of error to restore correct state
      await loadUserTextures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTextures, loadUserTextures]);

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    saveAIGeneratedTexture,
    deleteTexture: performDelete
  }), [saveAIGeneratedTexture, performDelete]);

  // Store the save function in a ref to avoid infinite loops
  const saveAITextureRef = useRef(saveAIGeneratedTexture);
  saveAITextureRef.current = saveAIGeneratedTexture;

  // Also expose via callback prop for backwards compatibility
  useEffect(() => {
    if (onSaveAITexture) {
      if (user) {
        // Pass the current ref value, not the function itself
        onSaveAITexture(saveAITextureRef.current);
      } else {
        // Pass null when no user is authenticated
        onSaveAITexture(null);
      }
    }
  }, [user, onSaveAITexture]);

  // Reserved for future use
  // const handleTextureUpload = async (file: File) => {
  //   if (!user) {
  //     setShowAuthModal(true);
  //     return;
  //   }

  //   setUploadingTexture(true);
  //   try {
  //     // Upload to Firebase Storage
  //     const textureUrl = await uploadTexture(user.uid, file, file.name);

  //     // Create thumbnail (use the same URL for now, could generate a smaller version)
  //     const thumbnailUrl = textureUrl;

  //     // Save texture metadata to Firestore
  //     await saveTexture({
  //       userId: user.uid,
  //       name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
  //       url: textureUrl,
  //       thumbnailUrl: thumbnailUrl,
  //       isAIGenerated: false,
  //       metadata: {
  //         originalFileName: file.name,
  //         fileSize: file.size,
  //         fileType: file.type,
  //         uploadedBy: user.email
  //       }
  //     });

  //     // Reload textures list
  //     await loadUserTextures();

  //     // Auto-select the newly uploaded texture
  //     onTextureSelect(textureUrl);

  //     setAlertModal({ isOpen: true, message: 'Texture uploaded successfully!', type: 'success' });
  //   } catch (error) {
  //     console.error('Error uploading texture:', error);
  //     setAlertModal({ isOpen: true, message: 'Failed to upload texture. Please try again.', type: 'error' });
  //   } finally {
  //     setUploadingTexture(false);
  //   }
  // };


  if (loading) {
    return (
      <div className="fixed top-4 right-4 bg-white dark:bg-black p-4 rounded-lg shadow-lg">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {/* Account Toggle Button - Positioned at bottom left corner */}
      <div className="fixed bottom-4 left-4 z-30">
        {user ? (
          <button
            onClick={() => setShowAccountMenu(!showAccountMenu)}
            className="account-toggle bg-black/50 text-white p-3 rounded-full shadow-lg hover:bg-black/70 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-black/50 text-white px-4 py-2 rounded-full shadow-lg hover:bg-black/70"
          >
            Sign In
          </button>
        )}
      </div>

      {/* Account Menu Dropdown - Opens above the button */}
      {showAccountMenu && user && (
        <div className="account-menu fixed bottom-20 left-4 bg-black p-4 rounded-lg shadow-xl z-30 min-w-[200px]">
          <div className="space-y-3">
            <div className="text-sm text-white border-b border-white/20 pb-2">
              {user.email}
            </div>

            <button
              onClick={() => {
                setShowPublishedScenesModal(true);
                setShowAccountMenu(false);
              }}
              className="bg-white text-black px-4 py-2 rounded hover:bg-black hover:text-white w-full flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              My Links
            </button>

            <button
              onClick={handleSignOut}
              className="bg-black text-white px-4 py-2 rounded hover:bg-white hover:text-black border border-white/20 w-full"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}


      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false })}
        onConfirm={() => {
          if (confirmModal.textureId) {
            performDelete(confirmModal.textureId);
          }
        }}
        title="Delete Texture"
        message="Are you sure you want to delete this texture? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.type === 'success' ? 'Success' : alertModal.type === 'error' ? 'Error' : 'Info'}
        message={alertModal.message}
        type={alertModal.type}
      />

      {userId && (
        <PublishedScenesModal
          isOpen={showPublishedScenesModal}
          onClose={() => setShowPublishedScenesModal(false)}
          userId={userId}
        />
      )}
    </>
  );
});

TextureManager.displayName = 'TextureManager';

export default TextureManager;