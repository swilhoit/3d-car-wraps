'use client';

import { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { logOut } from '@/lib/firebase/auth';
import { uploadTexture } from '@/lib/firebase/storage';
import { saveTexture, getUserTextures, deleteTexture, updateTexture } from '@/lib/firebase/firestore';
import { base64ToBlob } from '@/lib/firebase/utils';
import AuthModal from './AuthModal';
import { ConfirmModal, AlertModal, ProgressModal } from './CustomModal';
import PublishedScenesModal from './PublishedScenesModal';

export interface Texture {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  isAIGenerated?: boolean;
  createdAt?: unknown;
  metadata?: Record<string, unknown>;
  // Firestore fields with meta_ prefix
  meta_editorStateUrl?: string;
  meta_prompt?: string;
  meta_generatedAt?: string;
  meta_generatedBy?: string;
}

interface TextureManagerProps {
  onTextureSelect: (textureUrl: string) => void;
  currentTexture?: string | null;
  onSaveAITexture?: (saveFunction: ((base64: string, name: string) => Promise<string>) | null) => void;
  onTexturesLoaded?: (textures: Texture[]) => void;
  userId?: string;
}

export interface TextureManagerHandle {
  saveAIGeneratedTexture: (base64: string, name: string, prompt?: string, editorState?: Record<string, unknown>, thumbnailBase64?: string) => Promise<string>;
  uploadTextureImages: (base64: string, name: string, editorState?: Record<string, unknown>, thumbnailBase64?: string) => Promise<{ textureUrl: string; thumbnailUrl: string; cleanedEditorState: Record<string, unknown> | null }>;
  deleteTexture: (textureId: string) => Promise<void>;
  renameTexture: (textureId: string, newName: string) => Promise<void>;
  updateTextureMetadata: (textureId: string, data: { name?: string; url?: string; thumbnailUrl?: string; metadata?: Record<string, unknown> }) => Promise<void>;
}

const TextureManager = forwardRef<TextureManagerHandle, TextureManagerProps>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ onTextureSelect, currentTexture, onSaveAITexture, onTexturesLoaded, userId }, ref) => {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userTextures, setUserTextures] = useState<Texture[]>([]);
  // const [uploadingTexture, setUploadingTexture] = useState(false); // Reserved for future use
  // const [loadingTextures, setLoadingTextures] = useState(false); // Reserved for future use
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showPublishedScenesModal, setShowPublishedScenesModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; textureId?: string }>({ isOpen: false });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, message: '', type: 'info' });
  const [progressModal, setProgressModal] = useState<{ isOpen: boolean; progress: number; currentStep: string; totalSteps: number; completedSteps: number }>({ isOpen: false, progress: 0, currentStep: '', totalSteps: 0, completedSteps: 0 });
  
  // Use ref to store the callback to avoid re-running effect when callback changes
  const onTexturesLoadedRef = useRef(onTexturesLoaded);
  
  // Keep ref up to date
  useEffect(() => {
    onTexturesLoadedRef.current = onTexturesLoaded;
  }, [onTexturesLoaded]);

  // Load user textures when authenticated
  useEffect(() => {
    const loadTextures = async () => {
      if (!user) {
        setUserTextures([]);
        if (onTexturesLoadedRef.current) onTexturesLoadedRef.current([]);
        return;
      }

      // setLoadingTextures(true);
      try {
        const textures = await getUserTextures(user.uid);

        // Validate texture URLs to identify broken Firebase links - run in parallel for speed
        const validateTexture = async (texture: Texture): Promise<Texture> => {
          // Skip validation for data URLs and local files
          if (texture.url?.startsWith('data:') || texture.url?.startsWith('/')) {
            return texture;
          }

          // For Firebase storage URLs, check if they're accessible
          if (texture.url?.includes('firebasestorage.googleapis.com')) {
            try {
              // Use a faster HEAD request with a timeout to avoid hanging
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

              const response = await fetch(texture.url, {
                method: 'HEAD',
                signal: controller.signal
              });

              clearTimeout(timeoutId);

              if (!response.ok) {
                console.warn(`Inaccessible Firebase texture (${response.status}): ${texture.name} (${texture.url})`);
                // Keep texture but mark as potentially broken in cache manager
                if (typeof window !== 'undefined') {
                  const { textureCache } = await import('@/lib/cacheManager');
                  textureCache.markUrlAsBroken(texture.url);
                }
              }
            } catch (error) {
              console.warn(`Could not validate texture: ${texture.name}`, error);
              // If it's a network error, mark as broken but keep the texture
              if (typeof window !== 'undefined') {
                const { textureCache } = await import('@/lib/cacheManager');
                textureCache.markUrlAsBroken(texture.url);
              }
            }
          }
          
          // Always return the texture - keep it in the list even if validation fails
          return texture;
        };

        // Run all validations in parallel for much faster loading
        const validatedTextures = await Promise.all(
          (textures as Texture[]).map(texture => validateTexture(texture))
        );

        setUserTextures(validatedTextures);
        if (onTexturesLoadedRef.current) onTexturesLoadedRef.current(validatedTextures);
      } catch (error) {
        console.error('Error loading textures:', error);
        // Handle index building error gracefully
        const err = error as { code?: string; message?: string };
        if (err?.code === 'failed-precondition' && err?.message?.includes('index')) {
          console.log('Firestore index is still building. Textures will be available shortly.');
          // Don't show an error to the user, just use empty array
          setUserTextures([]);
          if (onTexturesLoadedRef.current) onTexturesLoadedRef.current([]);
        }
      } finally {
        // setLoadingTextures(false);
      }
    };

    if (user) {
      loadTextures();
    } else {
      setUserTextures([]);
      if (onTexturesLoadedRef.current) onTexturesLoadedRef.current([]);
    }
  }, [user]);

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
    if (!user) {
      // console.log('🔍 loadUserTextures: No user authenticated');
      return;
    }

    // console.log('🔍 Loading textures for user:', user.uid);
    // setLoadingTextures(true);
    try {
      const textures = await getUserTextures(user.uid);
      // console.log('🔍 Loaded textures from Firestore:', {
      //   count: textures.length,
      //   textureNames: textures.map(t => (t as Texture).name)
      // });

      setUserTextures(textures as Texture[]);
      if (onTexturesLoadedRef.current) {
        // console.log('🔍 Calling onTexturesLoaded with', textures.length, 'textures');
        onTexturesLoadedRef.current(textures as Texture[]);
      }
    } catch (error) {
      console.error('Error loading textures:', error);
      // Handle index building error gracefully
      const err = error as { code?: string; message?: string };
      if (err?.code === 'failed-precondition' && err?.message?.includes('index')) {
        console.log('Firestore index is still building. Textures will be available shortly.');
        // Don't show an error to the user, just use empty array
        setUserTextures([]);
        if (onTexturesLoadedRef.current) onTexturesLoadedRef.current([]);
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

  const saveAIGeneratedTexture = useCallback(async (base64: string, name: string, prompt?: string, editorState?: Record<string, unknown>, thumbnailBase64?: string): Promise<string> => {
    // console.log('📦 saveAIGeneratedTexture called:', {
    //   hasUser: !!user,
    //   name,
    //   hasBase64: !!base64,
    //   base64Length: base64?.length,
    //   hasEditorState: !!editorState,
    //   hasThumbnail: !!thumbnailBase64
    // });

    if (!user) {
      // console.log('User not authenticated, showing auth modal');
      setShowAuthModal(true);
      throw new Error('User must be authenticated to save textures');
    }

    try {
      // Show progress modal
      const totalSteps = 4; // Compression, main upload, panel uploads, firestore save
      let completedSteps = 0;

      console.log('🎯 PROGRESS: Opening modal...');
      setProgressModal({
        isOpen: true,
        progress: 0,
        currentStep: 'Preparing images...',
        totalSteps,
        completedSteps
      });
      console.log('🎯 PROGRESS: Modal state set to open');

      // Force a small delay to ensure modal renders before heavy processing starts
      await new Promise(resolve => setTimeout(resolve, 50));

      // Import compression utility
      const { compressImage, isDataUrlTooLarge } = await import('@/lib/imageCompression');

      // Check if image needs compression (Firebase limit is ~10MB)
      let processedBase64 = base64;
      if (isDataUrlTooLarge(base64, 9)) { // Use 9MB as safe limit
        console.log('Image too large, compressing...');
        setProgressModal(prev => ({ ...prev, currentStep: 'Compressing main texture...' }));
        processedBase64 = await compressImage(base64, 2, 2048); // Compress to max 2MB, 2048px
      }

      completedSteps++;
      setProgressModal(prev => ({ ...prev, progress: (completedSteps / totalSteps) * 100, completedSteps }));

      // OPTIMIZATION: Upload main texture and thumbnail in parallel
      const blob = base64ToBlob(processedBase64);

      // Prepare thumbnail upload if provided
      let thumbnailBlob: Blob | null = null;
      if (thumbnailBase64) {
        console.log('📸 Preparing separate thumbnail...');
        let processedThumbnail = thumbnailBase64;
        if (isDataUrlTooLarge(thumbnailBase64, 1)) { // Use 1MB limit for thumbnails
          console.log('Thumbnail too large, compressing...');
          processedThumbnail = await compressImage(thumbnailBase64, 0.5, 512); // Compress to max 512px
        }
        thumbnailBlob = base64ToBlob(processedThumbnail);
      }

      // Upload main texture and thumbnail in parallel for faster saving
      setProgressModal(prev => ({ ...prev, currentStep: 'Uploading main texture and thumbnail...' }));
      console.log('🚀 PARALLEL UPLOAD: Starting main texture and thumbnail uploads in parallel...');
      const mainUploadStartTime = performance.now();

      const uploadPromises = [
        uploadTexture(user.uid, blob, `${name}.png`)
      ];

      if (thumbnailBlob) {
        uploadPromises.push(uploadTexture(user.uid, thumbnailBlob, `${name}_thumb.png`));
      }

      const uploadResults = await Promise.all(uploadPromises);
      const textureUrl = uploadResults[0];
      const thumbnailUrl = thumbnailBlob ? uploadResults[1] : textureUrl;

      const mainUploadEndTime = performance.now();
      console.log(`✅ PARALLEL UPLOAD: Completed ${uploadPromises.length} main uploads in ${(mainUploadEndTime - mainUploadStartTime).toFixed(0)}ms`);

      completedSteps++;
      setProgressModal(prev => ({ ...prev, progress: (completedSteps / totalSteps) * 100, completedSteps }));

      // Save texture metadata to Firestore
      // Clean editorState to remove large image data before saving
      let cleanedEditorState = null;
      if (editorState) {
        // Helper function to remove undefined values from objects
        const removeUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
          const cleaned: Record<string, unknown> = {};
          for (const key in obj) {
            if (obj[key] !== undefined && obj[key] !== null) {
              if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                cleaned[key] = removeUndefined(obj[key] as Record<string, unknown>);
              } else {
                cleaned[key] = obj[key];
              }
            }
          }
          return cleaned;
        };

        // OPTIMIZATION: Collect all upload tasks first, then run them in parallel
        const panelStates = editorState.panelStates as Array<Record<string, unknown>> || [];

        // Collect all upload tasks for parallel processing
        const uploadTasks: Array<{
          type: 'panel' | 'logo' | 'background';
          panelIndex: number;
          blob: Blob;
          filename: string;
        }> = [];

        // Scan all panels and collect upload tasks
        panelStates.forEach((panel: Record<string, unknown>, panelIndex: number) => {
          // Panel generatedImage
          if (panel.generatedImage && typeof panel.generatedImage === 'string' && panel.generatedImage.startsWith('data:')) {
            uploadTasks.push({
              type: 'panel',
              panelIndex,
              blob: base64ToBlob(panel.generatedImage),
              filename: `${name}_panel_${panelIndex}.png`
            });
          }

          // Panel logo
          const logo = panel.logo as Record<string, unknown> | undefined;
          if (logo?.image && typeof logo.image === 'string' && logo.image.startsWith('data:')) {
            uploadTasks.push({
              type: 'logo',
              panelIndex,
              blob: base64ToBlob(logo.image),
              filename: `${name}_panel_${panelIndex}_logo.png`
            });
          }

          // Panel background image
          const bgImage = panel.backgroundImage as Record<string, unknown> | undefined;
          if (bgImage?.image && typeof bgImage.image === 'string' && bgImage.image.startsWith('data:')) {
            uploadTasks.push({
              type: 'background',
              panelIndex,
              blob: base64ToBlob(bgImage.image),
              filename: `${name}_panel_${panelIndex}_background.png`
            });
          }
        });

        setProgressModal(prev => ({ ...prev, currentStep: `Uploading ${uploadTasks.length} panel images...` }));
        console.log(`🚀 PARALLEL UPLOAD: Starting ${uploadTasks.length} panel image uploads in parallel...`);
        const uploadStartTime = performance.now();

        // Upload all panel images in parallel for maximum speed
        const uploadResults = await Promise.allSettled(
          uploadTasks.map(task => uploadTexture(user.uid, task.blob, task.filename))
        );

        const uploadEndTime = performance.now();
        const successCount = uploadResults.filter(r => r.status === 'fulfilled').length;
        console.log(`✅ PARALLEL UPLOAD: Completed ${successCount}/${uploadTasks.length} uploads in ${(uploadEndTime - uploadStartTime).toFixed(0)}ms`);

        completedSteps++;
        setProgressModal(prev => ({ ...prev, progress: (completedSteps / totalSteps) * 100, completedSteps }));

        // Map results back to upload tasks
        const uploadMap = new Map<string, string>();
        uploadResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const task = uploadTasks[index];
            const key = `${task.type}_${task.panelIndex}`;
            uploadMap.set(key, result.value);
          } else {
            const task = uploadTasks[index];
            console.warn(`Failed to upload ${task.type} for panel ${task.panelIndex}:`, result.reason);
          }
        });

        // Now process panels synchronously with uploaded URLs
        cleanedEditorState = {
          ...removeUndefined(editorState),
          panelStates: panelStates.map((panel: Record<string, unknown>, panelIndex: number) => {
            // Create a clean panel object preserving all essential fields
            const cleanPanel: Record<string, unknown> = {};

            // Preserve all panel properties
            if (panel.id !== undefined) cleanPanel.id = panel.id;
            if (panel.name) cleanPanel.name = panel.name;
            if (panel.templatePath) cleanPanel.templatePath = panel.templatePath;
            if (panel.width !== undefined) cleanPanel.width = panel.width;
            if (panel.height !== undefined) cleanPanel.height = panel.height;
            if (panel.backgroundColor) cleanPanel.backgroundColor = panel.backgroundColor;
            if (panel.prompt) cleanPanel.prompt = panel.prompt;
            if (panel.panelType) cleanPanel.panelType = panel.panelType;
            if (panel.logoOverlay) cleanPanel.logoOverlay = panel.logoOverlay;

            // Get uploaded panel image URL from parallel upload
            const panelImageUrl = uploadMap.get(`panel_${panelIndex}`);
            if (panelImageUrl) {
              cleanPanel.generatedImageUrl = panelImageUrl;
            }

            // Preserve logo configuration
            if (panel.logo) {
              const logo = panel.logo as Record<string, unknown>;
              const cleanLogo: Record<string, unknown> = {};
              if (logo.x !== undefined) cleanLogo.x = logo.x;
              if (logo.y !== undefined) cleanLogo.y = logo.y;
              if (logo.width !== undefined) cleanLogo.width = logo.width;
              if (logo.height !== undefined) cleanLogo.height = logo.height;

              // Get uploaded logo URL from parallel upload
              const logoUrl = uploadMap.get(`logo_${panelIndex}`);
              if (logoUrl) {
                cleanLogo.imageUrl = logoUrl;
              } else if (logo.imageUrl) {
                // Preserve existing imageUrl if not re-uploaded
                cleanLogo.imageUrl = logo.imageUrl;
              }

              // Only add logo if it has all required fields
              if (cleanLogo.x !== undefined && cleanLogo.y !== undefined && 
                  cleanLogo.width !== undefined && cleanLogo.height !== undefined && 
                  cleanLogo.imageUrl) {
                cleanPanel.logo = cleanLogo;
              }
            }

            // Preserve backgroundImage configuration
            if (panel.backgroundImage) {
              const bgImage = panel.backgroundImage as Record<string, unknown>;
              const cleanBgImage: Record<string, unknown> = {};
              if (bgImage.x !== undefined) cleanBgImage.x = bgImage.x;
              if (bgImage.y !== undefined) cleanBgImage.y = bgImage.y;
              if (bgImage.width !== undefined) cleanBgImage.width = bgImage.width;
              if (bgImage.height !== undefined) cleanBgImage.height = bgImage.height;

              // Get uploaded background image URL from parallel upload
              const bgUrl = uploadMap.get(`background_${panelIndex}`);
              if (bgUrl) {
                cleanBgImage.imageUrl = bgUrl;
                console.log(`✅ Uploaded background image for panel ${panelIndex} (${panel.name}) to Firebase`);
              } else if (bgImage.image && typeof bgImage.image === 'string' && bgImage.image.startsWith('http')) {
                // Already a Firebase URL in image field - preserve it
                cleanBgImage.imageUrl = bgImage.image;
                console.log(`✅ Preserved HTTP URL for panel ${panelIndex} (${panel.name}) background image`);
              } else if (bgImage.imageUrl) {
                // Already have imageUrl field - preserve it
                cleanBgImage.imageUrl = bgImage.imageUrl;
                console.log(`✅ Preserved imageUrl for panel ${panelIndex} (${panel.name}) background image`);
              }

              // Only add backgroundImage if it has all required fields
              if (cleanBgImage.x !== undefined && cleanBgImage.y !== undefined && 
                  cleanBgImage.width !== undefined && cleanBgImage.height !== undefined && 
                  cleanBgImage.imageUrl) {
                cleanPanel.backgroundImage = cleanBgImage;
              }
            }

            // Preserve other properties
            if (panel.uploadedImage === 'placeholder' || typeof panel.uploadedImage === 'string' && !panel.uploadedImage.startsWith('data:')) {
              cleanPanel.uploadedImage = panel.uploadedImage;
            }

            return cleanPanel;
          }),
          // Process imageLibrary - collect all library image uploads for parallel processing
          imageLibrary: editorState.imageLibrary && Array.isArray(editorState.imageLibrary)
            ? await (async () => {
                const libraryImages = editorState.imageLibrary as Array<Record<string, unknown>>;

                // Collect all library image upload tasks
                const libraryUploadTasks: Array<{
                  type: 'image' | 'thumbnail';
                  index: number;
                  blob: Blob;
                  filename: string;
                }> = [];

                libraryImages.forEach((libraryImage: Record<string, unknown>, index: number) => {
                  // Main image upload
                  if (libraryImage.imageUrl && typeof libraryImage.imageUrl === 'string' && libraryImage.imageUrl.startsWith('data:')) {
                    libraryUploadTasks.push({
                      type: 'image',
                      index,
                      blob: base64ToBlob(libraryImage.imageUrl),
                      filename: `${name}_library_${index}.png`
                    });
                  }

                  // Thumbnail upload
                  if (libraryImage.thumbnailUrl && typeof libraryImage.thumbnailUrl === 'string' && libraryImage.thumbnailUrl.startsWith('data:')) {
                    libraryUploadTasks.push({
                      type: 'thumbnail',
                      index,
                      blob: base64ToBlob(libraryImage.thumbnailUrl),
                      filename: `${name}_library_${index}_thumb.png`
                    });
                  }
                });

                if (libraryUploadTasks.length > 0) {
                  setProgressModal(prev => ({ ...prev, currentStep: `Uploading ${libraryUploadTasks.length} library images...` }));
                  console.log(`🚀 PARALLEL UPLOAD: Starting ${libraryUploadTasks.length} library image uploads in parallel...`);
                  const libUploadStartTime = performance.now();

                  // Upload all library images in parallel
                  const libraryUploadResults = await Promise.allSettled(
                    libraryUploadTasks.map(task => uploadTexture(user.uid, task.blob, task.filename))
                  );

                  const libUploadEndTime = performance.now();
                  const libSuccessCount = libraryUploadResults.filter(r => r.status === 'fulfilled').length;
                  console.log(`✅ PARALLEL UPLOAD: Completed ${libSuccessCount}/${libraryUploadTasks.length} library uploads in ${(libUploadEndTime - libUploadStartTime).toFixed(0)}ms`);

                  // Map results
                  const libraryUploadMap = new Map<string, string>();
                  libraryUploadResults.forEach((result, taskIndex) => {
                    if (result.status === 'fulfilled') {
                      const task = libraryUploadTasks[taskIndex];
                      const key = `${task.type}_${task.index}`;
                      libraryUploadMap.set(key, result.value);
                    }
                  });

                  // Process library images with uploaded URLs
                  return libraryImages.map((libraryImage: Record<string, unknown>, index: number) => {
                    const cleanLibraryImage: Record<string, unknown> = {
                      id: libraryImage.id,
                      createdAt: libraryImage.createdAt,
                      source: libraryImage.source
                    };

                    // Get uploaded image URL or preserve existing HTTP URL
                    const uploadedImageUrl = libraryUploadMap.get(`image_${index}`);
                    if (uploadedImageUrl) {
                      cleanLibraryImage.imageUrl = uploadedImageUrl;
                      console.log(`✅ Uploaded library image ${index} to Firebase`);
                    } else if (libraryImage.imageUrl && typeof libraryImage.imageUrl === 'string' && libraryImage.imageUrl.startsWith('http')) {
                      cleanLibraryImage.imageUrl = libraryImage.imageUrl;
                    } else {
                      return null;
                    }

                    // Get uploaded thumbnail URL or preserve existing HTTP URL
                    const uploadedThumbUrl = libraryUploadMap.get(`thumbnail_${index}`);
                    if (uploadedThumbUrl) {
                      cleanLibraryImage.thumbnailUrl = uploadedThumbUrl;
                    } else if (libraryImage.thumbnailUrl && typeof libraryImage.thumbnailUrl === 'string' && libraryImage.thumbnailUrl.startsWith('http')) {
                      cleanLibraryImage.thumbnailUrl = libraryImage.thumbnailUrl;
                    } else {
                      cleanLibraryImage.thumbnailUrl = cleanLibraryImage.imageUrl;
                    }

                    return cleanLibraryImage;
                  }).filter(img => img !== null);
                } else {
                  // No uploads needed, just preserve existing HTTP URLs
                  return libraryImages.map((libraryImage: Record<string, unknown>) => {
                    if (libraryImage.imageUrl && typeof libraryImage.imageUrl === 'string' && libraryImage.imageUrl.startsWith('http')) {
                      return {
                        id: libraryImage.id,
                        createdAt: libraryImage.createdAt,
                        source: libraryImage.source,
                        imageUrl: libraryImage.imageUrl,
                        thumbnailUrl: libraryImage.thumbnailUrl || libraryImage.imageUrl
                      };
                    }
                    return null;
                  }).filter(img => img !== null);
                }
              })()
            : []
        };
      }

      // Upload editor state to Firebase Storage if it exists
      let editorStateUrl: string | null = null;
      if (cleanedEditorState) {
        try {
          setProgressModal(prev => ({ ...prev, currentStep: 'Saving editor state...' }));
          const editorStateString = JSON.stringify(cleanedEditorState);
          console.log('🔍 Uploading editorState to Storage, size:', editorStateString.length);

          const { uploadEditorState } = await import('../lib/firebase/storage');
          editorStateUrl = await uploadEditorState(user.uid, editorStateString, name);
          console.log('✅ Editor state uploaded to Storage:', editorStateUrl);
        } catch (error) {
          console.error('❌ Failed to upload editor state:', error);
          // Continue even if editor state upload fails
        }
      }

      // Save to Firestore
      setProgressModal(prev => ({ ...prev, currentStep: 'Saving to database...' }));

      await saveTexture({
        userId: user.uid,
        name: name,
        url: textureUrl,
        thumbnailUrl: thumbnailUrl, // Use the separate thumbnail if provided
        isAIGenerated: true,
        metadata: {
          prompt: prompt || 'AI Generated',
          generatedAt: new Date().toISOString(),
          generatedBy: user.email || null,
          // Store URL to editor state JSON file in Storage (not the JSON itself)
          editorStateUrl: editorStateUrl
        }
      });

      completedSteps++;
      setProgressModal(prev => ({ ...prev, progress: 100, completedSteps, currentStep: 'Complete!' }));

      // Small delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 500));

      // Close progress modal
      setProgressModal({ isOpen: false, progress: 0, currentStep: '', totalSteps: 0, completedSteps: 0 });

      // Reload textures list
      await loadUserTextures();
      if (onTexturesLoaded) {
        const textures = await getUserTextures(user.uid);
        onTexturesLoaded(textures as Texture[]);
      }

      return textureUrl;
    } catch (error) {
      console.error('Error saving AI-generated texture:', error);
      // Close progress modal on error
      setProgressModal({ isOpen: false, progress: 0, currentStep: '', totalSteps: 0, completedSteps: 0 });
      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, setShowAuthModal, loadUserTextures]);

  // Upload texture images to Firebase Storage WITHOUT creating a new Firestore document
  // This is used when updating existing textures
  const uploadTextureImages = useCallback(async (
    base64: string,
    name: string,
    editorState?: Record<string, unknown>,
    thumbnailBase64?: string
  ): Promise<{ textureUrl: string; thumbnailUrl: string; cleanedEditorState: Record<string, unknown> | null }> => {
    if (!user) {
      setShowAuthModal(true);
      throw new Error('User must be authenticated to upload textures');
    }

    try {
      // Import compression utility
      const { compressImage, isDataUrlTooLarge } = await import('@/lib/imageCompression');

      // Check if image needs compression (Firebase limit is ~10MB)
      let processedBase64 = base64;
      if (isDataUrlTooLarge(base64, 9)) { // Use 9MB as safe limit
        console.log('Image too large, compressing...');
        processedBase64 = await compressImage(base64, 2, 2048); // Compress to max 2MB, 2048px
      }

      // Convert base64 to blob
      const blob = base64ToBlob(processedBase64);

      // Upload to Firebase Storage
      const textureUrl = await uploadTexture(user.uid, blob, `${name}.png`);
      console.log('📦 Texture uploaded to Storage:', textureUrl);

      // Upload thumbnail if provided
      let thumbnailUrl = textureUrl; // Default to texture URL
      if (thumbnailBase64) {
        console.log('📸 Uploading separate thumbnail...');
        // Compress thumbnail if needed
        let processedThumbnail = thumbnailBase64;
        if (isDataUrlTooLarge(thumbnailBase64, 1)) { // Use 1MB limit for thumbnails
          console.log('Thumbnail too large, compressing...');
          processedThumbnail = await compressImage(thumbnailBase64, 0.5, 512); // Compress to max 512px
        }
        const thumbnailBlob = base64ToBlob(processedThumbnail);
        thumbnailUrl = await uploadTexture(user.uid, thumbnailBlob, `${name}_thumb.png`);
        console.log('✅ Thumbnail uploaded:', thumbnailUrl);
      }

      // Clean editorState to remove large image data
      let cleanedEditorState = null;
      if (editorState) {
        // Helper function to remove undefined values from objects
        const removeUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
          const cleaned: Record<string, unknown> = {};
          for (const key in obj) {
            if (obj[key] !== undefined && obj[key] !== null) {
              if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                cleaned[key] = removeUndefined(obj[key] as Record<string, unknown>);
              } else {
                cleaned[key] = obj[key];
              }
            }
          }
          return cleaned;
        };

        cleanedEditorState = {
          ...removeUndefined(editorState),
          panelStates: await Promise.all((editorState.panelStates as Array<Record<string, unknown>>)?.map(async (panel: Record<string, unknown>, panelIndex: number) => {
            // Create a clean panel object preserving all essential fields
            const cleanPanel: Record<string, unknown> = {};

            // Preserve all panel properties
            if (panel.id !== undefined) cleanPanel.id = panel.id;
            if (panel.name) cleanPanel.name = panel.name;
            if (panel.templatePath) cleanPanel.templatePath = panel.templatePath;
            if (panel.width !== undefined) cleanPanel.width = panel.width;
            if (panel.height !== undefined) cleanPanel.height = panel.height;
            if (panel.backgroundColor) cleanPanel.backgroundColor = panel.backgroundColor;
            if (panel.prompt) cleanPanel.prompt = panel.prompt;
            if (panel.panelType) cleanPanel.panelType = panel.panelType;
            if (panel.logoOverlay) cleanPanel.logoOverlay = panel.logoOverlay;

            // Upload panel's generatedImage to Firebase Storage if it exists
            if (panel.generatedImage && typeof panel.generatedImage === 'string' && panel.generatedImage.startsWith('data:')) {
              try {
                const panelImageBlob = base64ToBlob(panel.generatedImage);
                const panelImageUrl = await uploadTexture(user.uid, panelImageBlob, `${name}_panel_${panelIndex}.png`);
                cleanPanel.generatedImageUrl = panelImageUrl; // Save Firebase URL instead of data URL
              } catch (error) {
                console.warn(`Failed to upload panel ${panelIndex} image, skipping`, error);
              }
            } else if (panel.generatedImageUrl) {
              // Preserve existing Firebase URL
              cleanPanel.generatedImageUrl = panel.generatedImageUrl;
            }

            // Upload logo image to Firebase Storage if it's a data URL
            if (panel.logo && typeof panel.logo === 'object') {
              const logoObj = panel.logo as Record<string, unknown>;
              const cleanLogo: Record<string, unknown> = {};

              if (logoObj.x !== undefined) cleanLogo.x = logoObj.x;
              if (logoObj.y !== undefined) cleanLogo.y = logoObj.y;
              if (logoObj.width !== undefined) cleanLogo.width = logoObj.width;
              if (logoObj.height !== undefined) cleanLogo.height = logoObj.height;

              if (logoObj.image && typeof logoObj.image === 'string' && logoObj.image.startsWith('data:')) {
                try {
                  const logoBlob = base64ToBlob(logoObj.image);
                  const logoUrl = await uploadTexture(user.uid, logoBlob, `${name}_panel_${panelIndex}_logo.png`);
                  cleanLogo.imageUrl = logoUrl;
                } catch (error) {
                  console.warn(`Failed to upload panel ${panelIndex} logo, skipping`, error);
                }
              } else if (logoObj.imageUrl) {
                cleanLogo.imageUrl = logoObj.imageUrl;
              }

              // Only add logo if it has all required fields
              if (cleanLogo.x !== undefined && cleanLogo.y !== undefined && 
                  cleanLogo.width !== undefined && cleanLogo.height !== undefined && 
                  cleanLogo.imageUrl) {
                cleanPanel.logo = cleanLogo;
              }
            }

            // Upload backgroundImage to Firebase Storage if it's a data URL
            if (panel.backgroundImage && typeof panel.backgroundImage === 'object') {
              const bgObj = panel.backgroundImage as Record<string, unknown>;
              const cleanBgImage: Record<string, unknown> = {};

              if (bgObj.x !== undefined) cleanBgImage.x = bgObj.x;
              if (bgObj.y !== undefined) cleanBgImage.y = bgObj.y;
              if (bgObj.width !== undefined) cleanBgImage.width = bgObj.width;
              if (bgObj.height !== undefined) cleanBgImage.height = bgObj.height;

              if (bgObj.image && typeof bgObj.image === 'string' && bgObj.image.startsWith('data:')) {
                // Upload data URL to Firebase
                try {
                  const bgBlob = base64ToBlob(bgObj.image);
                  const bgUrl = await uploadTexture(user.uid, bgBlob, `${name}_panel_${panelIndex}_bg.png`);
                  cleanBgImage.imageUrl = bgUrl;
                  console.log(`✅ Uploaded background image for panel ${panelIndex} (${panel.name})`);
                } catch (error) {
                  console.warn(`Failed to upload panel ${panelIndex} background, skipping`, error);
                }
              } else if (bgObj.image && typeof bgObj.image === 'string' && bgObj.image.startsWith('http')) {
                // Already a Firebase URL in the image field - preserve it
                cleanBgImage.imageUrl = bgObj.image;
                console.log(`✅ Preserved HTTP URL for panel ${panelIndex} (${panel.name}) background image`);
              } else if (bgObj.imageUrl) {
                // Already have imageUrl field - preserve it
                cleanBgImage.imageUrl = bgObj.imageUrl;
                console.log(`✅ Preserved imageUrl for panel ${panelIndex} (${panel.name}) background image`);
              } else {
                console.warn(`⚠️ Panel ${panelIndex} (${panel.name}) has backgroundImage but no valid image data`);
              }

              // Only add backgroundImage if it has all required fields
              if (cleanBgImage.x !== undefined && cleanBgImage.y !== undefined && 
                  cleanBgImage.width !== undefined && cleanBgImage.height !== undefined && 
                  cleanBgImage.imageUrl) {
                cleanPanel.backgroundImage = cleanBgImage;
              }
            }

            // Preserve other properties
            if (panel.uploadedImage === 'placeholder' || typeof panel.uploadedImage === 'string' && !panel.uploadedImage.startsWith('data:')) {
              cleanPanel.uploadedImage = panel.uploadedImage;
            }

            return cleanPanel;
          }) || []),
          // Process imageLibrary to upload base64 images to Firebase Storage
          imageLibrary: editorState.imageLibrary && Array.isArray(editorState.imageLibrary)
            ? await Promise.all((editorState.imageLibrary as Array<Record<string, unknown>>).map(async (libraryImage: Record<string, unknown>, index: number) => {
                const cleanLibraryImage: Record<string, unknown> = {
                  id: libraryImage.id,
                  createdAt: libraryImage.createdAt,
                  source: libraryImage.source
                };

                // Upload imageUrl to Firebase Storage if it's a data URL
                if (libraryImage.imageUrl && typeof libraryImage.imageUrl === 'string' && libraryImage.imageUrl.startsWith('data:')) {
                  try {
                    const imageBlob = base64ToBlob(libraryImage.imageUrl);
                    const firebaseUrl = await uploadTexture(user.uid, imageBlob, `${name}_library_${index}.png`);
                    cleanLibraryImage.imageUrl = firebaseUrl;
                    console.log(`✅ Uploaded library image ${index} to Firebase`);
                  } catch (error) {
                    console.warn(`Failed to upload library image ${index}, skipping`, error);
                    // Skip this image if upload fails
                    return null;
                  }
                } else if (libraryImage.imageUrl && typeof libraryImage.imageUrl === 'string' && libraryImage.imageUrl.startsWith('http')) {
                  // Already a Firebase URL, preserve it
                  cleanLibraryImage.imageUrl = libraryImage.imageUrl;
                } else {
                  // Invalid image URL, skip
                  return null;
                }

                // Upload thumbnailUrl to Firebase Storage if it's a data URL (and different from imageUrl)
                if (libraryImage.thumbnailUrl && typeof libraryImage.thumbnailUrl === 'string' && libraryImage.thumbnailUrl.startsWith('data:')) {
                  try {
                    const thumbBlob = base64ToBlob(libraryImage.thumbnailUrl);
                    const firebaseThumbUrl = await uploadTexture(user.uid, thumbBlob, `${name}_library_${index}_thumb.png`);
                    cleanLibraryImage.thumbnailUrl = firebaseThumbUrl;
                  } catch (error) {
                    console.warn(`Failed to upload library thumbnail ${index}, using main image`, error);
                    cleanLibraryImage.thumbnailUrl = cleanLibraryImage.imageUrl; // Fallback to main image
                  }
                } else if (libraryImage.thumbnailUrl && typeof libraryImage.thumbnailUrl === 'string' && libraryImage.thumbnailUrl.startsWith('http')) {
                  cleanLibraryImage.thumbnailUrl = libraryImage.thumbnailUrl;
                } else {
                  // No thumbnail, use main image
                  cleanLibraryImage.thumbnailUrl = cleanLibraryImage.imageUrl;
                }

                return cleanLibraryImage;
              })).then(results => results.filter(img => img !== null)) // Remove failed uploads
            : []
        };
      }

      return { textureUrl, thumbnailUrl, cleanedEditorState };
    } catch (error) {
      console.error('Error uploading texture images:', error);
      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, setShowAuthModal]);

  // Create handleDeleteTexture as a callback - reserved for future use
  // const handleDeleteTexture = useCallback(async (textureId: string) => {
  //   setConfirmModal({ isOpen: true, textureId });
  // }, []);

  const performDelete = useCallback(async (textureId: string) => {

    try {
      // Find the texture being deleted to get its URL
      const textureToDelete = userTextures.find(t => t.id === textureId);
      const isCurrentlySelected = textureToDelete && currentTexture === textureToDelete.url;

      await deleteTexture(textureId);

      // If the deleted texture was currently selected, reset to default
      if (isCurrentlySelected) {
        console.log('Deleted texture was currently selected, resetting to default');
        onTextureSelect(''); // Empty string will trigger fallback to default texture
      }

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
  }, [userTextures, loadUserTextures, currentTexture, onTextureSelect]);

  const performRename = useCallback(async (textureId: string, newName: string) => {
    try {
      await updateTexture(textureId, { name: newName });

      // Update local state immediately for responsive UI
      setUserTextures(prev => prev.map(t =>
        t.id === textureId ? { ...t, name: newName } : t
      ));

      if (onTexturesLoaded) {
        const updatedTextures = userTextures.map(t =>
          t.id === textureId ? { ...t, name: newName } : t
        );
        onTexturesLoaded(updatedTextures);
      }

      // Reload textures to ensure sync with database
      await loadUserTextures();
      setAlertModal({ isOpen: true, message: 'Design renamed successfully!', type: 'success' });
    } catch (error) {
      console.error('Error renaming texture:', error);
      setAlertModal({ isOpen: true, message: 'Failed to rename design.', type: 'error' });
      // Reload in case of error to restore correct state
      await loadUserTextures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTextures, loadUserTextures]);

  const performUpdateMetadata = useCallback(async (textureId: string, data: { name?: string; url?: string; thumbnailUrl?: string; metadata?: Record<string, unknown> }) => {
    try {
      // Filter out undefined values - Firestore doesn't accept them
      const cleanedData: { name?: string; url?: string; thumbnailUrl?: string; metadata?: Record<string, unknown> } = {};

      if (data.name !== undefined) {
        cleanedData.name = data.name;
      }
      if (data.url !== undefined) {
        cleanedData.url = data.url;
      }
      if (data.thumbnailUrl !== undefined) {
        cleanedData.thumbnailUrl = data.thumbnailUrl;
      }
      if (data.metadata !== undefined) {
        // Also clean metadata object recursively
        cleanedData.metadata = Object.entries(data.metadata).reduce((acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, unknown>);
      }

      console.log('🧹 Cleaned data for Firestore:', { textureId, cleanedData });
      await updateTexture(textureId, cleanedData);

      // Update local state immediately for responsive UI
      setUserTextures(prev => prev.map(t =>
        t.id === textureId ? { ...t, ...data } : t
      ));

      if (onTexturesLoaded) {
        const updatedTextures = userTextures.map(t =>
          t.id === textureId ? { ...t, ...data } : t
        );
        onTexturesLoaded(updatedTextures);
      }

      // Reload textures to ensure sync with database
      await loadUserTextures();
      console.log('✅ Texture metadata updated successfully');
    } catch (error) {
      console.error('Error updating texture metadata:', error);
      setAlertModal({ isOpen: true, message: 'Failed to update design.', type: 'error' });
      // Reload in case of error to restore correct state
      await loadUserTextures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTextures, loadUserTextures]);

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    saveAIGeneratedTexture,
    uploadTextureImages,
    deleteTexture: performDelete,
    renameTexture: performRename,
    updateTextureMetadata: performUpdateMetadata
  }), [saveAIGeneratedTexture, uploadTextureImages, performDelete, performRename, performUpdateMetadata]);

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

      <ProgressModal
        isOpen={progressModal.isOpen}
        title="Saving Design"
        message="Uploading your UV design to the cloud..."
        progress={progressModal.progress}
        currentStep={progressModal.currentStep}
        totalSteps={progressModal.totalSteps}
        completedSteps={progressModal.completedSteps}
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