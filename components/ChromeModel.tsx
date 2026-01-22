'use client'

import React, { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Preload, ContactShadows, useGLTF, useFBX, PerformanceMonitor, AdaptiveDpr, AdaptiveEvents } from '@react-three/drei';
import * as THREE from 'three';
import UVPanelEditor from '../components/UVPanelEditor';
import AuthModal from './AuthModal';
import PublishModal from './PublishModal';
import PublishedScenesModal from './PublishedScenesModal';
import PasswordPrompt from './PasswordPrompt';
import { CacheCleaner } from './CacheCleaner';
import CameraController from './scene/CameraController';
import BackgroundSphere from './scene/BackgroundSphere';
import GroundPlane from './scene/GroundPlane';
import WaymoModel from './scene/WaymoModel';
import PersonModel from './scene/PersonModel';
import { useProgressiveTexture } from '@/hooks/useProgressiveTexture';
import { useTexturePreloader } from '@/hooks/useTexturePreloader';
import CachedImage from '@/components/CachedImage';
import { Texture } from './TextureManager';
import { ConfirmModal, AlertModal } from './CustomModal';

const defaultTextures = [
  { id: 'blank-waymo.png', name: 'Blank', thumbnail: '/blank-waymo.png' },
  { id: 'chargers.jpg', name: 'Chargers', thumbnail: '/thumbnails/chargers.png' },
  { id: 'littlecaesars.png', name: 'Little Caesars', thumbnail: '/thumbnails/little caesars.png' },
  { id: 'picnic.png', name: 'Picnic', thumbnail: '/thumbnails/picnic.png' },
  { id: 'robosense.jpg', name: 'RoboSense', thumbnail: '/thumbnails/robosense.png' },
  { id: 'creator.png', name: 'The Creator', thumbnail: '/thumbnails/the creator.png' },
  { id: 'venom.png', name: 'Venom', thumbnail: '/thumbnails/venom.png' },
  { id: 'wolt.png', name: 'Wolt', thumbnail: '/thumbnails/wolt.png' },
  { id: 'xpel.png', name: 'Xpel', thumbnail: '/thumbnails/xpel.png' },
  { id: 'pickup.png', name: 'Pickup', thumbnail: '/thumbnails/prime.png' },
  { id: 'donjulio.png', name: 'Don Julio', thumbnail: '/thumbnails/don julio.png' },
  { id: 'electricstate.png', name: 'Electric State', thumbnail: '/thumbnails/netflix.png' }
];

useGLTF.preload('/Waymo.glb');
useFBX.preload('/3D-guy.fbx');

async function checkTextureExists(filename: string): Promise<boolean> {
  if (filename.startsWith('data:')) {
    return true;
  }

  try {
    const response = await fetch(`/${filename}`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

interface ChromeModelProps {
  currentTexture?: string | null;
  onSaveAITexture?: ((base64: string, name: string, prompt?: string, editorState?: Record<string, unknown>, thumbnailBase64?: string) => Promise<string>) | null;
  onUploadTextureImages?: ((base64: string, name: string, editorState?: Record<string, unknown>, thumbnailBase64?: string) => Promise<{ textureUrl: string; thumbnailUrl: string; cleanedEditorState: Record<string, unknown> | null }>) | null;
  userTextures?: Texture[];
  onTextureSelect?: (textureUrl: string) => void;
  onDeleteUserTexture?: (textureId: string) => Promise<void>;
  onRenameUserTexture?: (textureId: string, newName: string) => Promise<void>;
  onUpdateTextureMetadata?: (textureId: string, data: { name?: string; url?: string; thumbnailUrl?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  userId?: string | null;
  userEmail?: string | null;
}

export default function ChromeModel({ currentTexture: externalTexture, onSaveAITexture, onUploadTextureImages, userTextures = [], onTextureSelect, onDeleteUserTexture, onRenameUserTexture, onUpdateTextureMetadata, userId, userEmail }: ChromeModelProps) {
  // Initialize texture preloader
  useTexturePreloader()

  // Initialize with blank Waymo texture as default
  const [internalTexture, setInternalTexture] = useState<string>('blank-waymo.png')
  const [isTextureLoading, setIsTextureLoading] = useState(false)
  // Use internal texture if external is null or undefined
  const currentTexture = externalTexture !== null && externalTexture !== undefined ? externalTexture : internalTexture

  // Ensure blank Waymo texture stays as default
  useEffect(() => {
    if (!externalTexture) {
      setInternalTexture('blank-waymo.png')
    }
  }, [externalTexture])

  const [dpr, setDpr] = useState(1)
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(new Set())
  const [presetTextures, setPresetTextures] = useState(defaultTextures)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedModel, setSelectedModel] = useState('nano-banana')
  const [generatedTextures, setGeneratedTextures] = useState<Array<{ id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string }>>([])
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referencePreview, setReferencePreview] = useState<string | null>(null)
  const [isRotating, setIsRotating] = useState(false)
  const [showPerson, setShowPerson] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [numberOfUnits, setNumberOfUnits] = useState(1)
  const [formation, setFormation] = useState<'grid' | 'line' | 'scatter'>('grid')
  const [scatterSeed, setScatterSeed] = useState(0)
  // const [galleryMode, setGalleryMode] = useState<'texture' | 'background'>('texture')
  const [galleryView, setGalleryView] = useState<'card' | 'list'>('list')
  const [activeLibraryTab, setActiveLibraryTab] = useState<'my-designs' | 'past-clients' | 'saved-snapshots'>('my-designs')
  const [userHasManuallySetView, setUserHasManuallySetView] = useState(false)
  const [savedSnapshots, setSavedSnapshots] = useState<Array<{ id: string; url: string; prompt: string; timestamp: number }>>(() => {
    // Load saved snapshots from localStorage on mount
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('savedSnapshots')
        if (saved) {
          return JSON.parse(saved)
        }
      } catch (e) {
        console.error('Failed to parse saved snapshots:', e)
        localStorage.removeItem('savedSnapshots')
      }
    }
    return []
  })

  // Auto-switch gallery view based on content (only if user hasn't manually set preference)
  useEffect(() => {
    if (!userHasManuallySetView && activeLibraryTab === 'my-designs') {
      const myDesigns = [...generatedTextures, ...userTextures.map(t => ({
        id: t.url,
        name: t.name,
        thumbnail: t.thumbnailUrl || t.url,
        isUserTexture: true,
        textureId: t.id
      }))];

      const uniqueDesigns = myDesigns.filter((design, index, array) => {
        // Remove entries that look like the old blank template
        if (design.name === 'Blank' && design.id.includes('blank-template')) {
          return false;
        }

        // Remove generated textures that don't have valid imageData
        if ('isGenerated' in design && design.isGenerated) {
          const generatedTexture = design as { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string };
          if (!generatedTexture.imageData || !generatedTexture.imageData.startsWith('data:')) {
            return false;
          }
        }

        // Deduplicate by ID
        return array.findIndex(d => d.id === design.id) === index;
      });

      // Switch to card view if there are designs, list view if empty
      const newView = uniqueDesigns.length > 0 ? 'card' : 'list';
      if (galleryView !== newView) {
        setGalleryView(newView);
      }
    }
  }, [generatedTextures, userTextures, activeLibraryTab, userHasManuallySetView, galleryView]);

  const [backgroundColor, setBackgroundColor] = useState('#1a1a1a')
  const [flagColor, setFlagColor] = useState('#ff0000')
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
  const [skyboxPreset, setSkyboxPreset] = useState<string | null>(null)
  const [floorMode, setFloorMode] = useState<'asphalt' | 'custom'>('asphalt')
  const [floorColor, setFloorColor] = useState('#808080')
  const [showBackgroundModal, setShowBackgroundModal] = useState(false)
  const [backgroundPrompt, setBackgroundPrompt] = useState('')
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false)
  const [showUVPanelEditor, setShowUVPanelEditor] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingTexture, setEditingTexture] = useState<{ id: string, name: string, imageData: string, editorState?: any } | null>(null)
  const [combinedUVMap, setCombinedUVMap] = useState<string | null>(null)
  const [generatedBackgrounds, setGeneratedBackgrounds] = useState<Array<{ id: string, url: string }>>(() => {
    // Start with empty array to avoid loading non-existent files
    return []
  })
  const [uploadedBackgrounds, setUploadedBackgrounds] = useState<Array<{ id: string, url: string, name: string }>>(() => {
    // Load uploaded backgrounds from localStorage on mount
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('uploadedBackgrounds')
        if (saved) {
          const parsed = JSON.parse(saved)
          // Filter out any entries with base64 data to prevent quota issues
          // These will need to be re-uploaded
          return parsed.filter((bg: { url: string }) => bg.url && !bg.url.startsWith('data:'))
        }
      } catch (e) {
        console.error('Failed to parse saved backgrounds:', e)
        // Clear corrupt data
        localStorage.removeItem('uploadedBackgrounds')
      }
    }
    return []
  })
  const [scenePosition, setScenePosition] = useState({ x: 0, y: 0, z: 0 })
  const [sceneRotation, setSceneRotation] = useState({ x: 0, y: 0, z: 0 })
  const [showControls, setShowControls] = useState(false)
  const [rotationSpeed, setRotationSpeed] = useState(0.01)
  const [recentlyGeneratedTextures, setRecentlyGeneratedTextures] = useState<Set<string>>(new Set())
  const [showSnapshotModal, setShowSnapshotModal] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; action?: () => void; message?: string }>({ isOpen: false })
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, message: '', type: 'info' })
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; textureId?: string; currentName?: string }>({ isOpen: false })
  const [newTextureName, setNewTextureName] = useState('')
  const [snapshotConfig, setSnapshotConfig] = useState({
    quality: 'high' as 'low' | 'medium' | 'high' | 'ultra',
    resolution: 2048,
    antialias: true,
    shadows: false,
    environmentQuality: 'medium' as 'low' | 'medium' | 'high'
  })
  const [snapshotBackgroundPrompt, setSnapshotBackgroundPrompt] = useState('')
  const [isGeneratingSnapshotBackground, setIsGeneratingSnapshotBackground] = useState(false)
  const [generatedSnapshotBackground, setGeneratedSnapshotBackground] = useState<{ url: string; prompt: string } | null>(null)
  const [showBackgroundPreviewModal, setShowBackgroundPreviewModal] = useState(false)
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null)
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null)
  const [selectedSnapshotForPreview, setSelectedSnapshotForPreview] = useState<{ id: string; url: string; prompt: string; timestamp: number } | null>(null)

  // Camera angle presets - adjusted for street level perspective
  const [currentCameraAngle, setCurrentCameraAngle] = useState('threequarter')
  const [cameraRotation, setCameraRotation] = useState<{ azimuth: number, elevation: number, distance?: number }>({ azimuth: 0, elevation: 0, distance: undefined })

  // Save uploaded backgrounds to localStorage whenever they change
  useEffect(() => {
    try {
      if (uploadedBackgrounds.length > 0) {
        // Only save metadata, not the full data URLs to avoid quota issues
        const metadata = uploadedBackgrounds.map(bg => ({
          id: bg.id,
          name: bg.name,
          // Store only if it's a small thumbnail or external URL, not base64
          url: bg.url.startsWith('data:') ? null : bg.url
        }))
        localStorage.setItem('uploadedBackgrounds', JSON.stringify(metadata))
      } else {
        // Clear localStorage if all backgrounds are deleted
        localStorage.removeItem('uploadedBackgrounds')
      }
    } catch (e) {
      console.error('Failed to save backgrounds to localStorage:', e)
      // Clear localStorage if quota exceeded
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        localStorage.removeItem('uploadedBackgrounds')
      }
    }
  }, [uploadedBackgrounds])

  // Validate background image exists
  useEffect(() => {
    if (backgroundImage && backgroundImage.includes('bg_generated')) {
      // Check if the generated background file exists
      fetch(backgroundImage, { method: 'HEAD' })
        .then(response => {
          if (!response.ok) {
            setBackgroundImage(null)
          }
        })
        .catch(() => {
          setBackgroundImage(null)
        })
    }
  }, [backgroundImage])

  const cameraPresets: Record<string, { position: number[], target: number[], name: string }> = {
    front: { position: [0, 3, 22], target: [0, 0, 0], name: 'Front' },
    side: { position: [22, 3, 0], target: [0, 0, 0], name: 'Side' },
    back: { position: [0, 3, -22], target: [0, 0, 0], name: 'Back' },
    topFront: { position: [0, 12, 18], target: [0, 0, 0], name: 'Top Front' },
    lowAngle: { position: [0, 1, 18], target: [0, 1, 0], name: 'Low Angle' },
    threequarter: { position: [16, 6, 16], target: [0, 0, 0], name: '3/4 View' },
    custom: { position: [18, 15, 18], target: [0, 0, 0], name: 'Top 3/4' }
  }

  // Calculate camera position from spherical coordinates when in custom mode
  const getCameraPosition = (): [number, number, number] => {
    if (currentCameraAngle === 'custom') {
      const { azimuth, elevation, distance } = cameraRotation;
      const effectiveDistance = distance ?? 5;
      const target = [0, -0.5, 0];

      // Convert spherical coordinates to cartesian
      const x = effectiveDistance * Math.cos(elevation) * Math.sin(azimuth);
      const y = target[1] + effectiveDistance * Math.sin(elevation);
      const z = effectiveDistance * Math.cos(elevation) * Math.cos(azimuth);

      console.log('🎥 CUSTOM MODE - Calculated position:', {
        azimuth: (azimuth * 180 / Math.PI).toFixed(0) + '°',
        elevation: (elevation * 180 / Math.PI).toFixed(0) + '°',
        distance: effectiveDistance,
        position: [x.toFixed(2), y.toFixed(2), z.toFixed(2)]
      });

      return [x, y, z];
    }

    return cameraPresets[currentCameraAngle].position as [number, number, number];
  }

  // Validate current texture exists, reset to default if missing (but only for older textures)
  useEffect(() => {
    const validateCurrentTexture = async () => {
      if (currentTexture && currentTexture.startsWith('ai_generated_')) {
        // Don't validate textures that were just generated (give them time to be saved)
        if (recentlyGeneratedTextures.has(currentTexture)) {
          return
        }
        
        // Check if texture has base64 data first
        const textureWithData = generatedTextures.find(t => t.id === currentTexture && t.imageData && t.imageData.startsWith('data:'))
        if (textureWithData) {
          // Texture has base64 data, it's valid
          return
        }
        
        // Only check file existence if no base64 data
        const exists = await checkTextureExists(currentTexture)
        if (!exists) {
          console.warn('Current texture is missing, resetting to default:', currentTexture)
          setInternalTexture('waymo-uv-template.png')
        }
      }
    }
    
    if (currentTexture) {
      // Add delay to allow file system operations to complete
      const timeoutId = setTimeout(validateCurrentTexture, 2000)
      return () => clearTimeout(timeoutId)
    }
  }, [currentTexture, recentlyGeneratedTextures, generatedTextures])

  // Clean up missing textures on component mount and when textures change
  useEffect(() => {
    const cleanupMissingTextures = async () => {
      if (generatedTextures.length === 0) return
      
      const validTextures = []
      let hasChanges = false
      
      for (const texture of generatedTextures) {
        // Skip recently generated textures - give them time to be saved
        if (recentlyGeneratedTextures.has(texture.id)) {
          validTextures.push(texture)
          continue
        }
        
        // If texture has base64 data, it's valid regardless of file existence
        if (texture.imageData && texture.imageData.startsWith('data:')) {
          validTextures.push(texture)
          continue
        }
        
        // Only check file existence for textures without base64 data
        const exists = await checkTextureExists(texture.id)
        if (exists) {
          validTextures.push(texture)
        } else {
          console.warn('Removing missing texture from gallery:', texture.id)
          hasChanges = true
          // If this was the current texture, reset to default
          if (currentTexture === texture.id) {
            setInternalTexture('blank-waymo.png')
          }
        }
      }
      
      if (hasChanges) {
        setGeneratedTextures(validTextures)
      }
    }

    // Longer debounce to avoid validating newly generated textures too quickly
    const timeoutId = setTimeout(cleanupMissingTextures, 5000)
    return () => clearTimeout(timeoutId)
  }, [generatedTextures, currentTexture, recentlyGeneratedTextures]) // Run when textures or current texture changes

  // Clear recently generated texture protection after a grace period
  useEffect(() => {
    if (recentlyGeneratedTextures.size > 0) {
      const timeoutId = setTimeout(() => {
        setRecentlyGeneratedTextures(new Set())
      }, 30000) // 30 second grace period
      return () => clearTimeout(timeoutId)
    }
  }, [recentlyGeneratedTextures])

  // Helper function to composite canvas with background color
  const compositeCanvasWithBackground = (sourceCanvas: HTMLCanvasElement, bgColor: string, bgImage: string | null): HTMLCanvasElement => {
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = sourceCanvas.width
    outputCanvas.height = sourceCanvas.height
    const ctx = outputCanvas.getContext('2d')

    if (ctx) {
      // Fill with background color first
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)

      // If there's a background image, we could draw it here too
      // (but typically it's already in the CSS and handled separately)

      // Draw the 3D canvas on top
      ctx.drawImage(sourceCanvas, 0, 0)
    }

    return outputCanvas
  }

  // Function to download high-quality canvas snapshot
  const downloadHighQualitySnapshot = async () => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current as HTMLCanvasElement
    const originalDpr = dpr

    try {
      // Set high-quality rendering settings
      const targetResolution = snapshotConfig.resolution
      const qualityMultiplier = snapshotConfig.quality === 'ultra' ? 2 :
                               snapshotConfig.quality === 'high' ? 1.5 :
                               snapshotConfig.quality === 'medium' ? 1.2 : 1

      // Temporarily increase DPR and canvas size
      setDpr(Math.max(2, originalDpr * qualityMultiplier))

      // Wait for next frame to apply changes
      await new Promise(resolve => requestAnimationFrame(resolve))
      await new Promise(resolve => setTimeout(resolve, 100))

      // Composite the canvas with background color (if no skybox or background image)
      // This ensures solid color backgrounds are captured in the snapshot
      const outputCanvas = (!skyboxPreset && !backgroundImage)
        ? compositeCanvasWithBackground(canvas, backgroundColor, backgroundImage)
        : canvas

      // Capture the high-quality frame
      outputCanvas.toBlob((blob: Blob | null) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `3d-snapshot-${snapshotConfig.quality}-${targetResolution}x${targetResolution}-${Date.now()}.png`
          link.click()
          URL.revokeObjectURL(url)
        }

        // Restore original settings
        setDpr(originalDpr)
      }, 'image/png')

    } catch (error) {
      console.error('High-quality snapshot failed:', error)
      // Restore original settings on error
      setDpr(originalDpr)
    }
  }

  // Function to capture scene snapshot as base64 for AI processing
  const captureSceneSnapshot = async (): Promise<string | null> => {
    if (!canvasRef.current) return null

    const canvas = canvasRef.current as HTMLCanvasElement

    try {
      // Wait for next frame to ensure scene is rendered
      await new Promise(resolve => requestAnimationFrame(resolve))

      // Composite with background color if no skybox or background image
      const outputCanvas = (!skyboxPreset && !backgroundImage)
        ? compositeCanvasWithBackground(canvas, backgroundColor, backgroundImage)
        : canvas

      // Capture the canvas as base64
      return outputCanvas.toDataURL('image/jpeg', 0.9)
    } catch (error) {
      console.error('Scene snapshot capture failed:', error)
      return null
    }
  }

  // Function to download canvas snapshot (opens modal)
  const downloadSnapshot = () => {
    setShowSnapshotModal(true)
  }

  // Function to capture thumbnail for publishing (returns Promise<string | null>)
  const captureThumbnail = async (): Promise<string | null> => {
    console.log('🔍 Starting thumbnail capture...')

    if (!canvasRef.current) {
      console.error('❌ Canvas ref not available for thumbnail capture')
      return null
    }

    const canvas = canvasRef.current as HTMLCanvasElement
    console.log('📐 Canvas dimensions:', canvas.width, 'x', canvas.height)

    const originalDpr = dpr

    try {
      // Set optimal thumbnail settings (512x512 at good quality)
      const thumbnailSize = 512
      const qualityMultiplier = 1.5

      console.log('⚙️ Setting DPR for thumbnail capture...')
      // Temporarily increase DPR for better quality
      setDpr(Math.max(2, originalDpr * qualityMultiplier))

      // Wait for next frame to apply changes
      console.log('⏳ Waiting for render...')
      await new Promise(resolve => requestAnimationFrame(resolve))
      await new Promise(resolve => setTimeout(resolve, 200)) // Increased wait time

      // Composite with background color if no skybox or background image
      const outputCanvas = (!skyboxPreset && !backgroundImage)
        ? compositeCanvasWithBackground(canvas, backgroundColor, backgroundImage)
        : canvas

      // Capture the thumbnail
      console.log('📸 Capturing canvas as blob...')
      return new Promise<string | null>((resolve) => {
        outputCanvas.toBlob((blob: Blob | null) => {
          // Restore original settings
          setDpr(originalDpr)
          console.log('🔄 DPR restored to:', originalDpr)

          if (blob) {
            console.log('✅ Blob created, size:', blob.size, 'bytes')
            // Convert blob to base64 for upload
            const reader = new FileReader()
            reader.onloadend = () => {
              const result = reader.result as string
              console.log('✅ Base64 conversion complete, length:', result.length)
              resolve(result)
            }
            reader.onerror = (error) => {
              console.error('❌ FileReader error:', error)
              resolve(null)
            }
            reader.readAsDataURL(blob)
          } else {
            console.error('❌ Canvas.toBlob returned null')
            resolve(null)
          }
        }, 'image/jpeg', 0.8) // Use JPEG with 80% quality for smaller file size
      })

    } catch (error) {
      console.error('❌ Thumbnail capture failed:', error)
      // Restore original settings on error
      setDpr(originalDpr)
      return null
    }
  }

  // Function to handle starting an edit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditTexture = (texture: { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string, editorState?: any }) => {
    if (texture.imageData) {
      setEditingTexture({
        id: texture.id,
        name: texture.name,
        imageData: texture.imageData,
        editorState: texture.editorState // Pass through any saved editor state
      })
      setShowUVPanelEditor(true)
    }
  }

  // Function to edit user texture
  const handleEditUserTexture = async (texture: { id: string, name: string, thumbnail: string, isUserTexture: true, textureId: string }) => {
    try {
      // Get the full texture data from userTextures to access metadata with editor state
      const fullTextureData = userTextures?.find(t => t.id === texture.textureId);

      // Extract editor state from metadata
      // First try new format (meta_editorStateUrl from Firebase Storage)
      // Then fall back to old format (editorState directly in metadata)
      let editorState: Record<string, unknown> | undefined;

      const editorStateUrl = fullTextureData?.meta_editorStateUrl as string | undefined;
      if (editorStateUrl) {
        try {
          console.log('🔍 Fetching editor state from:', editorStateUrl);
          const response = await fetch(editorStateUrl);
          const jsonData = await response.json();
          editorState = jsonData;
          console.log('✅ Editor state loaded from Storage');
        } catch (error) {
          console.error('❌ Failed to fetch editor state from URL:', error);
        }
      } else if (fullTextureData?.metadata?.editorState) {
        // Fallback to old format
        editorState = fullTextureData.metadata.editorState as Record<string, unknown>;
        console.log('✅ Using legacy editor state from metadata');
      }

      // For user textures, we'll use the Firebase Storage URL as the imageData
      setEditingTexture({
        id: texture.textureId,
        name: texture.name,
        imageData: texture.id, // texture.id is the Firebase Storage URL
        editorState: editorState // Include editor state if available
      })
      setShowUVPanelEditor(true)
    } catch (error) {
      console.error('Error preparing texture for editing:', error);
      // Fallback to basic editing without state restoration
      setEditingTexture({
        id: texture.textureId,
        name: texture.name,
        imageData: texture.id
      })
      setShowUVPanelEditor(true)
    }
  }

  // Function to handle UV Panel Editor completion
  const handleUVPanelComplete = async (data: {
    uvMapUrl: string;
    thumbnailUrl?: string;
    designName: string;
    clientName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editorState: any; // DesignEditorState from UVPanelEditor - using any to avoid circular dependency
    flagColor?: string;
  }) => {
    const { uvMapUrl, thumbnailUrl, designName, clientName, editorState, flagColor: updatedFlagColor } = data;

    // Update flag color if provided
    if (updatedFlagColor) {
      setFlagColor(updatedFlagColor);
    }
    setCombinedUVMap(uvMapUrl)
    setInternalTexture(uvMapUrl)

    // Auto-apply the new texture to the model
    if (onTextureSelect) {
      onTextureSelect(uvMapUrl)
    }

    setShowUVPanelEditor(false)

    // Use thumbnailUrl if provided, otherwise fall back to uvMapUrl
    const displayThumbnail = thumbnailUrl || uvMapUrl;

    if (editingTexture) {
      // Update existing texture
      console.log('📝 Updating existing texture:', { editingTextureId: editingTexture.id, newName: designName })

      // Check if this is a Firestore texture (user texture) by looking in userTextures
      const isFirestoreTexture = userTextures.find(t => t.id === editingTexture.id);

      if (isFirestoreTexture && onUploadTextureImages && onUpdateTextureMetadata && userId) {
        // Upload UV map and thumbnail to Firebase Storage WITHOUT creating a new document
        console.log('🔥 Uploading UV map to Storage and updating existing Firestore document...')

        try {
          // Upload images directly to Storage (doesn't create a new Firestore document)
          const { textureUrl: newTextureUrl, thumbnailUrl: newThumbnailUrl, cleanedEditorState } = await onUploadTextureImages(
            uvMapUrl,
            `${designName || isFirestoreTexture.name}_${Date.now()}`,
            editorState,
            displayThumbnail
          );

          console.log('✅ Images uploaded to Storage:', { textureUrl: newTextureUrl, thumbnailUrl: newThumbnailUrl });

          // Upload editor state to Firebase Storage (same as new save flow)
          // This is critical - the updateTexture function filters out complex objects,
          // so we must upload as a JSON file and store the URL instead
          let editorStateUrl: string | null = null;
          const stateToUpload = cleanedEditorState || editorState;
          if (stateToUpload && userId) {
            try {
              const editorStateString = JSON.stringify(stateToUpload);
              console.log('🔍 Uploading editorState to Storage for update, size:', editorStateString.length);
              const { uploadEditorState } = await import('../lib/firebase/storage');
              editorStateUrl = await uploadEditorState(userId, editorStateString, designName || isFirestoreTexture.name);
              console.log('✅ Editor state uploaded to Storage:', editorStateUrl);
            } catch (error) {
              console.error('❌ Failed to upload editor state during update:', error);
              // Continue even if editor state upload fails
            }
          }

          // Clean existing metadata (remove undefined values)
          const existingMetadata = isFirestoreTexture.metadata || {};
          const cleanExistingMetadata = Object.entries(existingMetadata).reduce((acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = value;
            }
            return acc;
          }, {} as Record<string, unknown>);

          // Update ONLY the existing Firestore document (no new document created)
          await onUpdateTextureMetadata(editingTexture.id, {
            name: designName || isFirestoreTexture.name,
            url: newTextureUrl, // Update with new UV map URL
            thumbnailUrl: newThumbnailUrl, // Update with new thumbnail URL
            metadata: {
              ...cleanExistingMetadata,
              // Store the URL to the editor state JSON file, not the object itself
              // (Firestore updateTexture filters out complex objects)
              editorStateUrl: editorStateUrl,
              prompt: `Custom UV Map${clientName ? ` for ${clientName}` : ''} created with Panel Editor`,
              lastEditedAt: new Date().toISOString(),
              lastEditedBy: userEmail || 'unknown'
            }
          });

          console.log('✅ Firestore document updated successfully');

          // Apply the new texture immediately to the 3D model
          if (onTextureSelect) {
            onTextureSelect(newTextureUrl)
          }
        } catch (error) {
          console.error('Failed to update texture in Firestore:', error)
        }
      }

      // Update local generated textures state
      setGeneratedTextures(prev => prev.map(t =>
        t.id === editingTexture.id
          ? { ...t, thumbnail: displayThumbnail, imageData: uvMapUrl, name: designName || t.name }
          : t
      ))
      setEditingTexture(null)
    } else {
      // Save to Firebase first if available (only if user is authenticated)
      if (onSaveAITexture && userId) {
        try {
          await onSaveAITexture(
            uvMapUrl,
            designName || `UV_Map_${Date.now()}`,
            `Custom UV Map${clientName ? ` for ${clientName}` : ''} created with Panel Editor`,
            editorState, // Pass the complete editor state for restoration
            displayThumbnail // Pass the thumbnail separately
          )
          // Don't create local generated texture since it's saved to Firebase
          // The texture will appear in userTextures when the list reloads
        } catch (error) {
          console.error('🔍 DEBUG: Firebase save FAILED, but still NOT creating local texture to test')
          console.error('Failed to save UV map to Firebase:', error)
          // TODO: Show error to user instead of creating fallback
          console.error('UV map could not be saved. Please try again.')
        }
      } else {
        // No user authenticated, create local generated texture
        const newTextureId = `uv_map_${Date.now()}`
        setGeneratedTextures(prev => {
          const filteredTextures = prev.filter(t => !t.id.startsWith('uv_map_'))

          // Add the new UV map to local state
          const newTexture = {
            id: newTextureId,
            name: designName || `UV Map ${new Date().toLocaleString()}`,
            thumbnail: displayThumbnail,
            isGenerated: true as const,
            imageData: uvMapUrl
          }

          return [newTexture, ...filteredTextures]
        })
        // Apply the texture immediately
        setInternalTexture(newTextureId)
      }
    }
  }

  // Function to download AI-generated texture
  const downloadTexture = (textureObj: { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string }) => {
    if (textureObj.imageData && textureObj.imageData.startsWith('data:')) {
      // Use the full imageData for download
      const link = document.createElement('a')
      link.download = `${textureObj.id}`
      link.href = textureObj.imageData
      link.click()
    } else if (textureObj.thumbnail && textureObj.thumbnail.startsWith('data:')) {
      // Fallback to thumbnail if no full imageData
      const link = document.createElement('a')
      link.download = `${textureObj.id}`
      link.href = textureObj.thumbnail
      link.click()
    } else {
      setAlertModal({
        isOpen: true,
        message: 'No image data available for download',
        type: 'error'
      })
    }
  }

  // Function to download user texture
  const downloadUserTexture = async (textureObj: { id: string, name: string, thumbnail: string, isUserTexture: true, textureId: string }) => {
    try {
      // For user textures, we need to fetch the image from Firebase Storage
      const response = await fetch(textureObj.id) // textureObj.id is the Firebase Storage URL
      if (!response.ok) {
        throw new Error('Failed to fetch texture')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.download = `${textureObj.name}.png`
      link.href = url
      link.click()

      // Clean up the object URL
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading user texture:', error)
      setAlertModal({
        isOpen: true,
        message: 'Failed to download texture. Please try again.',
        type: 'error'
      })
    }
  }

  // Function to delete generated texture (local cleanup only)
  const deleteGeneratedTexture = (textureId: string) => {
    // Remove from generated textures list (local state only)
    setGeneratedTextures(prev => prev.filter(t => t.id !== textureId))

    // If it was selected, clear selection
    if (currentTexture === textureId) {
      setInternalTexture('blank-template.png')
    }

  }

  // Delete preset texture function
  const deletePresetTexture = (textureId: string) => {
    setPresetTextures(prev => prev.filter(t => t.id !== textureId));
    // If the deleted texture was selected, reset to blank
    if (currentTexture === textureId) {
      setInternalTexture('blank-template.png');
      if (onTextureSelect) {
        onTextureSelect('blank-template.png');
      }
    }
  };

  // Preload adjacent textures when one is selected
  useEffect(() => {
    if (currentTexture) {
      const allTextures = [...presetTextures, ...generatedTextures];
      const currentIndex = allTextures.findIndex(t => t.id === currentTexture);
      const adjacentIndices = [
        (currentIndex - 1 + allTextures.length) % allTextures.length,
        (currentIndex + 1) % allTextures.length
      ];

      adjacentIndices.forEach(idx => {
        const textureObj = allTextures[idx];
        if (textureObj && !preloadedImages.has(textureObj.id)) {
          const img = new Image();

          // Use imageData for AI-generated textures, regular path for others
          if ('imageData' in textureObj && textureObj.imageData && typeof textureObj.imageData === 'string' && textureObj.imageData.startsWith('data:')) {
            img.src = textureObj.imageData;
          } else if (textureObj.thumbnail && textureObj.thumbnail.startsWith('data:')) {
            img.src = textureObj.thumbnail;
          } else {
            img.src = `/${textureObj.id}`;
          }

          img.onload = () => {
            setPreloadedImages(prev => new Set(prev).add(textureObj.id));
          };

          img.onerror = () => {
            // Silently ignore preload errors to avoid console spam
          };
        }
      });
    }
  }, [currentTexture, preloadedImages, presetTextures, generatedTextures])

  return (
    <div className="w-full h-full flex flex-col md:flex-row canvas-container scene-viewer-container">
      {/* 3D Viewer */}
      <div className="flex-1 relative order-1 md:order-1" style={{ 
        backgroundColor: backgroundColor,
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        {/* Loading Overlay */}
        {isTextureLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 pointer-events-none">
            <div className="bg-black/80 rounded-lg px-4 py-3 flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              <span className="text-white text-sm">Loading texture...</span>
            </div>
          </div>
        )}

        <Canvas
          ref={canvasRef}
          camera={{ position: [0, 0, 5 + (Math.sqrt(numberOfUnits) - 1) * 1.2], fov: 45 }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            outputColorSpace: THREE.SRGBColorSpace,
            powerPreference: "high-performance",
            alpha: true,
            stencil: false,
            depth: true,
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true
          }}
          shadows
          onCreated={({ gl }) => {
            gl.shadowMap.enabled = true
            gl.shadowMap.type = THREE.PCFSoftShadowMap
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.2
            if (canvasRef.current) {
              (canvasRef as React.MutableRefObject<HTMLCanvasElement>).current = gl.domElement
            }
          }}
        >
          <PerformanceMonitor
            onIncline={() => setDpr(Math.min(window.devicePixelRatio, 2))}
            onDecline={() => setDpr(1)}
            flipflops={3}
            onFallback={() => setDpr(1)}
          />

          <AdaptiveDpr pixelated={false} />
          <AdaptiveEvents />
          
          {/* Natural sunlight setup */}
          <ambientLight intensity={0.4} color="#ffeedd" />
          <hemisphereLight
            intensity={0.6}
            color="#87CEEB"  // Sky blue
            groundColor="#8B7355"  // Earth brown
          />
          <directionalLight
            position={[5, 15, 5]}  // Higher sun position
            intensity={1.8}
            color="#fffaf0"  // Warm white sunlight
            castShadow
            shadow-mapSize={[4096, 4096]}  // Higher quality shadows
            shadow-camera-far={50}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
            shadow-bias={-0.0005}
          />
          <directionalLight
            position={[-5, 8, -5]}
            intensity={0.3}
            color="#87CEEB"  // Soft blue fill light (sky bounce)
          />
          
          <CameraController
            position={getCameraPosition()}
            target={cameraPresets[currentCameraAngle].target as [number, number, number]}
            distance={cameraRotation.distance}
          />

          <Suspense fallback={null}>
            <WaymoModel
              currentTexture={currentTexture}
              isRotating={isRotating}
              generatedTextures={generatedTextures}
              userTextures={userTextures}
              numberOfUnits={numberOfUnits}
              formation={formation}
              scatterSeed={scatterSeed}
              scenePosition={scenePosition}
              sceneRotation={sceneRotation}
              rotationSpeed={rotationSpeed}
              flagColor={flagColor}
              onLoadingChange={setIsTextureLoading}
            />


            {/* Person model for size comparison */}
            {showPerson && <PersonModel key={`person-model-${Date.now()}`} />}

            {/* Environment and background setup */}
            {skyboxPreset ? (
              // Use built-in skybox preset with ground alignment and natural lighting
              <Environment
                preset={skyboxPreset as 'studio' | 'forest' | 'apartment' | 'park' | 'dawn' | 'sunset' | 'warehouse' | 'lobby' | 'city' | 'night'}
                background
                backgroundBlurriness={0}
                backgroundIntensity={1.5}
                environmentIntensity={skyboxPreset === 'sunset' || skyboxPreset === 'dawn' ? 2 : 1.5}
                ground={{
                  height: -1.2, // Match the ground plane position
                  radius: 25,
                  scale: 80
                }}
              />
            ) : backgroundImage && (backgroundImage.endsWith('.exr') || backgroundImage.endsWith('.hdr')) ? (
              // Use EXR/HDR as both environment and background
              <Environment
                files={backgroundImage}
                resolution={1024}
                background
                ground={{
                  height: -1.2, // Match the ground plane position
                  radius: 25,
                  scale: 80
                }}
              />
            ) : backgroundImage ? (
              <>
                {/* Use studio HDRI for lighting */}
                <Environment
                  files="/studio_small_09_2k.exr"
                  resolution={512}
                  background={false}
                />
                {/* Wrap backgrounds around environment as HDRI-like sphere */}
                <BackgroundSphere image={backgroundImage} />
              </>
            ) : (
              // Default natural outdoor HDRI for better sunlight
              <Environment
                preset="sunset"
                background={false}
                environmentIntensity={0.8}
              />
            )}

            {/* Ground plane with gravel texture */}
            <GroundPlane floorMode={floorMode} floorColor={floorColor} />

            <ContactShadows
              position={[0, -1.19, 0]}
              opacity={0.5}
              scale={10}
              blur={2}
              far={5}
              resolution={256}
              color="#000000"
            />
          </Suspense>

          <Preload all />
        </Canvas>
        
        {/* Camera Angle Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-black/80 backdrop-blur-md rounded-lg p-2 z-10">
          <div className="text-white text-sm font-semibold mb-1">Camera Angles</div>
          {Object.entries(cameraPresets).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => {
                setCurrentCameraAngle(key)
                // Reset manual rotation when selecting a preset
                if (key !== 'custom') {
                  setCameraRotation({ azimuth: 0, elevation: 0, distance: undefined })
                }
              }}
              className={`px-3 py-1.5 rounded text-sm transition-all ${
                currentCameraAngle === key
                  ? 'bg-white text-black'
                  : 'bg-black text-white hover:bg-white hover:text-black'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Bottom Controls - All Centered */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center px-4 z-30">
          {/* Center Controls */}
          <div className="flex gap-2">
            <button
              onClick={() => setIsRotating(!isRotating)}
              className="px-3 py-1 bg-black/50 hover:bg-black/70 text-white rounded text-xs transition-colors flex items-center gap-1"
              title={isRotating ? "Pause rotation" : "Resume rotation"}
            >
              {isRotating ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Play
                </>
              )}
            </button>

            <button
              onClick={() => setShowPerson(!showPerson)}
              className={`px-3 py-1 ${showPerson ? 'bg-white text-black' : 'bg-black/50 hover:bg-black/70 text-white'} rounded text-xs transition-colors flex items-center gap-1 show-person-button`}
              title={showPerson ? "Hide person" : "Show person for size comparison"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {showPerson ? 'Hide' : 'Show'} Person
            </button>

            <button
              onClick={downloadSnapshot}
              className="px-3 py-1 bg-black/50 hover:bg-black/70 text-white rounded text-xs transition-colors flex items-center gap-1"
              title="Download snapshot"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Snapshot
            </button>

            {userId && (
              <button
                onClick={() => setShowPublishModal(true)}
                className="px-3 py-1 bg-black/50 hover:bg-black/70 text-white rounded text-xs transition-colors flex items-center gap-1"
                title="Share scene"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.432-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 3.12-9.243 7.342m9.243-7.342v12" />
                </svg>
                Share
              </button>
            )}

            {/* Scene Controls Button */}
            <div className="relative">
              <button
                onClick={() => setShowControls(!showControls)}
                className="px-3 py-1 bg-black/50 hover:bg-black/70 text-white rounded text-xs transition-colors flex items-center gap-1"
                title="Scene Controls"
              >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Scene Controls
            </button>
            
            {/* Dropdown Menu - Opens Upward */}
            {showControls && (
              <div className="absolute bottom-full mb-2 left-0 bg-black/90 rounded-lg p-4 space-y-4 min-w-[250px] z-50">
                {/* Unit Multiplier */}
                <div className="space-y-2">
                  <label className="text-white text-xs font-semibold block">Units: {numberOfUnits}</label>
                  <input
                    type="range"
                    min="1"
                    max="25"
                    value={numberOfUnits}
                    onChange={(e) => setNumberOfUnits(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Formation Controls - Only show when multiple units */}
                {numberOfUnits > 1 && (
                  <div className="space-y-2">
                    <label className="text-white text-xs font-semibold block">Formation</label>
                    <div className="flex gap-2">
                      {/* Grid Formation */}
                      <button
                        onClick={() => setFormation('grid')}
                        className={`flex-1 p-2 rounded border-2 transition-all ${
                          formation === 'grid'
                            ? 'bg-white border-white text-black'
                            : 'bg-transparent border-gray-600 text-white hover:border-white'
                        }`}
                        title="Grid Formation"
                      >
                        <svg className="w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" />
                        </svg>
                      </button>

                      {/* Line Formation */}
                      <button
                        onClick={() => setFormation('line')}
                        className={`flex-1 p-2 rounded border-2 transition-all ${
                          formation === 'line'
                            ? 'bg-white border-white text-black'
                            : 'bg-transparent border-gray-600 text-white hover:border-white'
                        }`}
                        title="Line Formation"
                      >
                        <svg className="w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="4" cy="12" r="2" fill="currentColor" />
                          <circle cx="12" cy="12" r="2" fill="currentColor" />
                          <circle cx="20" cy="12" r="2" fill="currentColor" />
                        </svg>
                      </button>

                      {/* Scatter Formation */}
                      <button
                        onClick={() => {
                          setFormation('scatter');
                          // Randomize the scatter pattern each time button is clicked
                          setScatterSeed(prev => prev + 1);
                        }}
                        className={`flex-1 p-2 rounded border-2 transition-all ${
                          formation === 'scatter'
                            ? 'bg-white border-white text-black'
                            : 'bg-transparent border-gray-600 text-white hover:border-white'
                        }`}
                        title="Scatter Formation (click to randomize)"
                      >
                        <svg className="w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="6" cy="8" r="1.5" fill="currentColor" />
                          <circle cx="15" cy="5" r="1.5" fill="currentColor" />
                          <circle cx="18" cy="14" r="1.5" fill="currentColor" />
                          <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                          <circle cx="12" cy="11" r="1.5" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Animation Speed Control */}
                <div className="space-y-2">
                  <label className="text-white text-xs font-semibold block">Animation Speed: {(rotationSpeed * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="0.05"
                    step="0.001"
                    value={rotationSpeed}
                    onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Camera Zoom Control */}
                <div className="space-y-2">
                  <label className="text-white text-xs font-semibold block">
                    Camera Zoom: {cameraRotation.distance !== undefined ? cameraRotation.distance.toFixed(1) : 'Auto'}
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="15"
                    step="0.5"
                    value={cameraRotation.distance ?? 5}
                    onChange={(e) => {
                      setCameraRotation(prev => ({ ...prev, distance: parseFloat(e.target.value) }))
                      setCurrentCameraAngle('custom')
                    }}
                    className="w-full"
                  />
                  <div className="flex justify-between text-white text-xs opacity-70">
                    <span>Zoomed In</span>
                    <span>Zoomed Out</span>
                  </div>
                </div>

                {/* Camera Rotation Controls */}
                <div className="space-y-2 border-t border-white/20 pt-2">
                  <label className="text-white text-xs font-semibold block">Camera Rotation</label>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-16">Orbit:</label>
                      <input
                        type="range"
                        min="-3.14"
                        max="3.14"
                        step="0.05"
                        value={cameraRotation.azimuth}
                        onChange={(e) => {
                          const newAzimuth = parseFloat(e.target.value);
                          console.log('🎚️ ORBIT SLIDER CHANGED:', newAzimuth, 'degrees:', (newAzimuth * 180 / Math.PI).toFixed(0));
                          setCameraRotation(prev => {
                            const newState = { ...prev, azimuth: newAzimuth };
                            console.log('📊 Camera rotation state updated:', newState);
                            return newState;
                          });
                          setCurrentCameraAngle('custom');
                        }}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-10 text-right">{(cameraRotation.azimuth * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-16">Height:</label>
                      <input
                        type="range"
                        min="0"
                        max="1.57"
                        step="0.05"
                        value={cameraRotation.elevation}
                        onChange={(e) => {
                          const newElevation = parseFloat(e.target.value);
                          console.log('🎚️ HEIGHT SLIDER CHANGED:', newElevation, 'degrees:', (newElevation * 180 / Math.PI).toFixed(0));
                          setCameraRotation(prev => {
                            const newState = { ...prev, elevation: newElevation };
                            console.log('📊 Camera rotation state updated:', newState);
                            return newState;
                          });
                          setCurrentCameraAngle('custom');
                        }}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-10 text-right">{(cameraRotation.elevation * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCameraRotation({ azimuth: 0, elevation: 0, distance: undefined })
                      setCurrentCameraAngle('threequarter')
                    }}
                    className="w-full px-2 py-1 bg-white hover:bg-black hover:text-white text-black border border-black rounded text-xs transition-colors mt-2"
                  >
                    Reset Camera
                  </button>
                </div>

                {/* Background Controls Section */}
                <div className="space-y-2 border-t border-white/20 pt-4">
                  <label className="text-white text-xs font-semibold block">Background</label>

                  {/* Quick Background Options */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Background Color Picker */}
                    <label className="relative overflow-hidden rounded border border-gray-600 hover:border-white cursor-pointer">
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => {
                          setBackgroundColor(e.target.value)
                          setBackgroundImage(null)
                          setSkyboxPreset(null)
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-full h-12 flex flex-col items-center justify-center" style={{ backgroundColor }}>
                        <span className="text-white text-xs font-semibold drop-shadow-lg">Color</span>
                      </div>
                    </label>

                    {/* Upload Background */}
                    <label className="relative overflow-hidden rounded border border-gray-600 hover:border-white bg-gray-700 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*,.exr,.hdr"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onloadend = () => {
                              const dataUrl = reader.result as string
                              const uploadId = `uploaded_bg_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
                              const newUploadedBg = {
                                id: uploadId,
                                url: dataUrl,
                                name: file.name
                              }
                              setUploadedBackgrounds(prev => [...prev, newUploadedBg])
                              setBackgroundImage(dataUrl)
                              setSkyboxPreset(null)
                            }
                            reader.readAsDataURL(file)
                          }
                        }}
                        className="hidden"
                      />
                      <div className="w-full h-12 flex flex-col items-center justify-center">
                        <span className="text-white text-xs font-semibold">Upload</span>
                      </div>
                    </label>

                    {/* Dark Preset */}
                    <button
                      onClick={() => {
                        setBackgroundImage(null)
                        setBackgroundColor('#1a1a1a')
                        setSkyboxPreset(null)
                      }}
                      className={`rounded border ${
                        backgroundColor === '#1a1a1a' && !backgroundImage && !skyboxPreset
                          ? 'border-white'
                          : 'border-gray-600 hover:border-white'
                      }`}
                    >
                      <div className="w-full h-12 bg-gray-800 flex items-center justify-center">
                        <span className="text-white text-xs font-semibold">Dark</span>
                      </div>
                    </button>

                    {/* Sky Preset */}
                    <button
                      onClick={() => {
                        setBackgroundImage(null)
                        setBackgroundColor('#1a1a1a')
                        setSkyboxPreset('park')
                      }}
                      className={`rounded border ${
                        skyboxPreset === 'park' && !backgroundImage
                          ? 'border-white'
                          : 'border-gray-600 hover:border-white'
                      }`}
                    >
                      <div className="w-full h-12 bg-gradient-to-b from-blue-400 to-green-300 flex items-center justify-center">
                        <span className="text-white text-xs font-semibold">Sky</span>
                      </div>
                    </button>
                  </div>

                  {/* Show background gallery if backgrounds exist */}
                  {(uploadedBackgrounds.length > 0 || generatedBackgrounds.length > 0) && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {uploadedBackgrounds.map((bg) => (
                        <button
                          key={bg.id}
                          onClick={() => {
                            setBackgroundImage(bg.url)
                            setSkyboxPreset(null)
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs ${
                            backgroundImage === bg.url
                              ? 'bg-white text-black'
                              : 'bg-gray-800 text-white hover:bg-gray-700'
                          }`}
                        >
                          {bg.name}
                        </button>
                      ))}
                      {generatedBackgrounds.map((bg) => (
                        <button
                          key={bg.id}
                          onClick={() => {
                            setBackgroundImage(bg.url)
                            setSkyboxPreset(null)
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs ${
                            backgroundImage === bg.url
                              ? 'bg-white text-black'
                              : 'bg-gray-800 text-white hover:bg-gray-700'
                          }`}
                        >
                          Generated BG
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Floor Controls Section */}
                <div className="space-y-2 border-t border-white/20 pt-4">
                  <label className="text-white text-xs font-semibold block">Floor</label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Asphalt (Default) */}
                    <button
                      onClick={() => setFloorMode('asphalt')}
                      className={`rounded border ${
                        floorMode === 'asphalt'
                          ? 'border-white'
                          : 'border-gray-600 hover:border-white'
                      }`}
                    >
                      <div className="w-full h-12 bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                        <span className="text-white text-xs font-semibold">Asphalt</span>
                      </div>
                    </button>

                    {/* Custom Color */}
                    <label className="relative overflow-hidden rounded border cursor-pointer">
                      <input
                        type="color"
                        value={floorColor}
                        onChange={(e) => {
                          setFloorColor(e.target.value)
                          setFloorMode('custom')
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className={`w-full h-12 flex items-center justify-center border ${
                        floorMode === 'custom'
                          ? 'border-white'
                          : 'border-gray-600 hover:border-white'
                      }`} style={{ backgroundColor: floorColor }}>
                        <span className="text-white text-xs font-semibold drop-shadow-lg">Custom</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Panel */}
      <div className="w-full md:w-64 h-40 md:h-full bg-black p-4 overflow-hidden order-2 md:order-2 flex flex-col">
        {/* Library - texture only */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Design Editor button - spans full width above library */}
            <button
              onClick={() => setShowUVPanelEditor(true)}
              className="relative overflow-hidden rounded-lg border-2 transition-all mb-4 border-gray-600/50 bg-gray-700 hover:bg-gray-600 text-white font-inter"
            >
              <div className="w-full h-12 flex items-center justify-center">
                <span className="text-xl mr-2">✨</span>
                <span className="text-white text-sm font-semibold">Create a Design</span>
              </div>
            </button>

            {/* Library Tabs */}
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setActiveLibraryTab('my-designs')}
                className={`flex-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeLibraryTab === 'my-designs'
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                My Designs
              </button>
              <button
                onClick={() => setActiveLibraryTab('past-clients')}
                className={`flex-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeLibraryTab === 'past-clients'
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                Past Clients
              </button>
              <button
                onClick={() => setActiveLibraryTab('saved-snapshots')}
                className={`flex-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeLibraryTab === 'saved-snapshots'
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                Snapshots
              </button>
            </div>

            {/* View controls */}
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white text-sm font-medium hidden md:block">
                {activeLibraryTab === 'my-designs' ? 'My Designs' : activeLibraryTab === 'past-clients' ? 'Past Clients' : 'Saved Snapshots'}
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setGalleryView('card');
                    setUserHasManuallySetView(true);
                  }}
                  className={`p-1 rounded ${galleryView === 'card' ? 'bg-white text-black' : 'bg-black text-white'}`}
                  title="Card view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setGalleryView('list');
                    setUserHasManuallySetView(true);
                  }}
                  className={`p-1 rounded ${galleryView === 'list' ? 'bg-white text-black' : 'bg-black text-white'}`}
                  title="List view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
            <div className={`flex-1 overflow-x-auto md:overflow-y-auto overflow-y-hidden md:overflow-x-hidden ${
              galleryView === 'card'
                ? 'flex md:grid md:grid-cols-2 md:auto-rows-min gap-x-1 gap-y-1'
                : 'flex flex-col gap-1'
            }`}>
          {/* Filter textures based on active tab */}
          {(() => {
            if (activeLibraryTab === 'my-designs') {
              // Show user textures and generated textures for "My Designs"
              // console.log('📚 Library Display - My Designs Tab:', {
              //   generatedTexturesCount: generatedTextures.length,
              //   userTexturesCount: userTextures.length,
              //   userTextures: userTextures.map(t => ({ id: t.id, name: t.name, url: t.url?.substring(0, 50) + '...' }))
              // });

              const myDesigns = [...generatedTextures, ...userTextures.map(t => ({
                id: t.url,
                name: t.name,
                thumbnail: t.thumbnailUrl || t.url,
                isUserTexture: true,
                textureId: t.id
              }))];

              // console.log('📚 Combined designs before filtering:', myDesigns.length);

              // Filter out duplicates and invalid entries
              const uniqueDesigns = myDesigns.filter((design, index, array) => {
                // Remove entries that look like the old blank template
                if (design.name === 'Blank' && design.id.includes('blank-template')) {
                  return false;
                }

                // Keep all generated textures - they might be saved to Firebase
                // Only remove if there's truly no data
                if ('isGenerated' in design && design.isGenerated) {
                  const generatedTexture = design as { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string };
                  // Only filter out if there's absolutely no image data or thumbnail
                  if (!generatedTexture.imageData && !generatedTexture.thumbnail) {
                    return false;
                  }
                }

                // Deduplicate by ID
                return array.findIndex(d => d.id === design.id) === index;
              });

              // console.log('📚 Unique designs after filtering:', uniqueDesigns.length);

              // Show empty state if no designs
              if (uniqueDesigns.length === 0) {
                if (galleryView === 'list') {
                  return (
                    <div className="flex items-center gap-2 p-2 text-gray-400">
                      <span className="text-lg">🎨</span>
                      <div>
                        <p className="text-sm">No designs yet</p>
                        <p className="text-xs opacity-75">Use Create a Design to create your first texture</p>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-center px-4">
                      <span className="text-2xl mb-2">🎨</span>
                      <p className="text-sm">No designs yet</p>
                      <p className="text-xs opacity-75">Use Create a Design to create your first texture</p>
                    </div>
                  );
                }
              }

              return uniqueDesigns.map((textureObj) => {
            const isPreloaded = preloadedImages.has(textureObj.id)
            const isGenerated = 'isGenerated' in textureObj && textureObj.isGenerated
            const isUserTexture = 'isUserTexture' in textureObj && textureObj.isUserTexture
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const isPreset = 'isPreset' in textureObj && textureObj.isPreset

            if (galleryView === 'list') {
              return (
                <div key={textureObj.id} className="relative group flex items-center gap-2 p-2 hover:bg-white/10 rounded">
                  <button
                    onClick={() => {
                      // Update internal texture for all texture types
                      setInternalTexture(textureObj.id)
                      // Also notify parent if callback exists
                      if (onTextureSelect) {
                        onTextureSelect(textureObj.id)
                      }
                    }}
                    className={`flex items-center gap-2 flex-1 ${
                      currentTexture === textureObj.id ? 'text-blue-400' : 'text-white'
                    }`}
                  >
                    <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                      {textureObj.thumbnail ? (
                        <CachedImage
                          src={textureObj.thumbnail}
                          alt={textureObj.name}
                          className="w-full h-full object-cover"
                          priority={currentTexture === textureObj.id}
                        />
                      ) : textureObj.name === 'Blank' ? (
                        <div className="w-full h-full bg-white" />
                      ) : (
                        <CachedImage
                          src={`/${textureObj.id}`}
                          alt={textureObj.name}
                          className="w-full h-full object-cover"
                          priority={currentTexture === textureObj.id}
                        />
                      )}
                    </div>
                    <span className="text-sm truncate">{textureObj.name}</span>
                    {isPreloaded && <span className="text-green-400">✓</span>}
                  </button>
                  {isGenerated && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditTexture(textureObj as { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string })
                        }}
                        className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-400 mr-1"
                        title="Edit texture"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          downloadTexture(textureObj as { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string })
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white hover:text-gray-300 mr-1"
                        title="Download texture"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmModal({
                            isOpen: true,
                            action: () => deleteGeneratedTexture(textureObj.id),
                            message: 'Delete this generated texture?'
                          })
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400"
                        title="Delete texture"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                  {isUserTexture && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditUserTexture(textureObj as { id: string, name: string, thumbnail: string, isUserTexture: true, textureId: string })
                        }}
                        className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-400 mr-1"
                        title="Edit texture"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          downloadUserTexture(textureObj as { id: string, name: string, thumbnail: string, isUserTexture: true, textureId: string })
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white hover:text-gray-300 mr-1"
                        title="Download texture"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          console.log('🏷️ Rename button clicked:', { textureObj, hasTextureId: 'textureId' in textureObj })
                          if ('textureId' in textureObj) {
                            console.log('✅ Opening rename modal for:', textureObj.name, textureObj.textureId)
                            setRenameModal({
                              isOpen: true,
                              textureId: textureObj.textureId,
                              currentName: textureObj.name
                            })
                            setNewTextureName(textureObj.name)
                          } else {
                            console.warn('❌ textureId not found in textureObj:', textureObj)
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-400"
                        title="Rename design"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if ('textureId' in textureObj && onDeleteUserTexture) {
                            setConfirmModal({
                              isOpen: true,
                              action: () => onDeleteUserTexture(textureObj.textureId),
                              message: 'Delete this texture from your library?'
                            })
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400"
                        title="Delete texture"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                  {(('isPreset' in textureObj && textureObj.isPreset) ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmModal({
                          isOpen: true,
                          action: () => deletePresetTexture(textureObj.id),
                          message: 'Delete this preset texture?'
                        })
                      }}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400"
                      title="Delete texture"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null)}
                </div>
              )
            }

            return (
              <div key={textureObj.id} className="relative group flex-shrink-0 h-fit">
                <button
                  onClick={() => {
                    // Update internal texture for all texture types
                    setInternalTexture(textureObj.id)
                    // Also notify parent if callback exists
                    if (onTextureSelect) {
                      onTextureSelect(textureObj.id)
                    }
                  }}
                  className={`relative overflow-hidden rounded-lg transition-all w-full ${
                    currentTexture === textureObj.id
                      ? 'border-2 border-white shadow-lg shadow-white/30'
                      : 'hover:opacity-80'
                  }`}
                >
                  <div className="w-full aspect-square">
                    {textureObj.thumbnail ? (
                      <CachedImage
                        src={textureObj.thumbnail}
                        alt={`${textureObj.name} logo`}
                        className="w-full h-full object-cover"
                        priority={currentTexture === textureObj.id}
                      />
                    ) : textureObj.name === 'Blank' ? (
                      <div className="w-full h-full bg-white" />
                    ) : (
                      <CachedImage
                        src={`/${textureObj.id}`}
                        alt={`Texture ${textureObj.id}`}
                        className="w-full h-full object-cover"
                        priority={currentTexture === textureObj.id}
                      />
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 text-center">
                    <span className="hidden md:inline">{textureObj.name}</span>
                    {isPreloaded && <span className="ml-1 text-green-400">✓</span>}
                  </div>
                </button>
                {isGenerated ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditTexture(textureObj as { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string })
                      }}
                      className="absolute top-1 right-16 bg-blue-500 hover:bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Edit texture"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadTexture(textureObj as { id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string })
                      }}
                      className="absolute top-1 right-8 bg-white hover:bg-black hover:text-white text-black rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-black"
                      title="Download texture"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmModal({
                          isOpen: true,
                          action: () => deleteGeneratedTexture(textureObj.id),
                          message: 'Delete this generated texture?'
                        })
                      }}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Delete texture"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                ) : isUserTexture ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditUserTexture(textureObj as { id: string, name: string, thumbnail: string, isUserTexture: true, textureId: string })
                      }}
                      className="absolute top-1 right-16 bg-blue-500 hover:bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Edit texture"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadUserTexture(textureObj as { id: string, name: string, thumbnail: string, isUserTexture: true, textureId: string })
                      }}
                      className="absolute top-1 right-8 bg-white hover:bg-black hover:text-white text-black rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-black"
                      title="Download texture"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if ('textureId' in textureObj && onDeleteUserTexture) {
                          setConfirmModal({
                            isOpen: true,
                            action: () => onDeleteUserTexture(textureObj.textureId),
                            message: 'Delete this texture from your library?'
                          })
                        }
                      }}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Delete texture"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                ) : ('isPreset' in textureObj && textureObj.isPreset) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmModal({
                        isOpen: true,
                        action: () => deletePresetTexture(textureObj.id),
                        message: 'Delete this preset texture?'
                      })
                    }}
                    className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Delete preset texture"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </div>
            )
              });
            } else if (activeLibraryTab === 'past-clients') {
              // Show preset textures for "Past Clients"
              return presetTextures.map(t => ({ ...t, isPreset: true })).map((textureObj) => {
                const isPreloaded = preloadedImages.has(textureObj.id)
                // const isGenerated = 'isGenerated' in textureObj && textureObj.isGenerated
                // const isUserTexture = 'isUserTexture' in textureObj && textureObj.isUserTexture
                const isPreset = 'isPreset' in textureObj && textureObj.isPreset

                if (galleryView === 'list') {
                  return (
                    <div key={textureObj.id} className="relative group flex items-center gap-2 p-2 hover:bg-white/10 rounded">
                      <button
                        onClick={() => {
                          setInternalTexture(textureObj.id)
                          if (onTextureSelect) {
                            onTextureSelect(textureObj.id)
                          }
                        }}
                        className={`flex items-center gap-2 flex-1 ${
                          currentTexture === textureObj.id ? 'text-blue-400' : 'text-white'
                        }`}
                      >
                        <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                          {textureObj.thumbnail ? (
                            <CachedImage
                              src={textureObj.thumbnail}
                              alt={`${textureObj.name} logo`}
                              className="w-full h-full object-cover"
                              priority={currentTexture === textureObj.id}
                            />
                          ) : textureObj.name === 'Blank' ? (
                            <div className="w-full h-full bg-white" />
                          ) : (
                            <CachedImage
                              src={`/${textureObj.id}`}
                              alt={textureObj.name}
                              className="w-full h-full object-cover"
                              priority={currentTexture === textureObj.id}
                            />
                          )}
                        </div>
                        <span className="text-xs truncate">{textureObj.name}</span>
                      </button>

                      {isPreset && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmModal({
                              isOpen: true,
                              action: () => deletePresetTexture(textureObj.id),
                              message: 'Delete this preset texture?'
                            })
                          }}
                          className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="Delete preset texture"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                } else {
                  return (
                    <div key={textureObj.id} className="relative group h-fit">
                      <button
                        onClick={() => {
                          setInternalTexture(textureObj.id)
                          if (onTextureSelect) {
                            onTextureSelect(textureObj.id)
                          }
                        }}
                        onMouseEnter={() => {
                          // Preload texture on hover for faster switching
                          const img = new Image()
                          if (textureObj.thumbnail) {
                            img.src = textureObj.thumbnail
                          } else if (textureObj.id !== 'Blank') {
                            img.src = `/${textureObj.id}`
                          }
                        }}
                        className={`relative w-full overflow-hidden rounded-lg border-2 transition-all ${
                          currentTexture === textureObj.id
                            ? 'border-blue-400 shadow-lg shadow-blue-400/30'
                            : isPreloaded
                            ? 'border-gray-400'
                            : 'border-gray-600 hover:border-gray-400'
                        }`}
                        title={textureObj.name}
                      >
                        <div className="w-full aspect-square">
                          {textureObj.thumbnail ? (
                            <CachedImage
                              src={textureObj.thumbnail}
                              alt={`${textureObj.name} logo`}
                              className="w-full h-full object-cover"
                              priority={currentTexture === textureObj.id}
                            />
                          ) : textureObj.name === 'Blank' ? (
                            <div className="w-full h-full bg-white" />
                          ) : (
                            <CachedImage
                              src={`/${textureObj.id}`}
                              alt={textureObj.name}
                              className="w-full h-full object-cover"
                              priority={currentTexture === textureObj.id}
                            />
                          )}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 text-center">
                          <span className="truncate block">{textureObj.name}</span>
                        </div>
                      </button>

                      {isPreset && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmModal({
                              isOpen: true,
                              action: () => deletePresetTexture(textureObj.id),
                              message: 'Delete this preset texture?'
                            })
                          }}
                          className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="Delete preset texture"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                }
              });
            } else if (activeLibraryTab === 'saved-snapshots') {
              // Show saved snapshots
              if (savedSnapshots.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-center px-4">
                    <span className="text-2xl mb-2">📸</span>
                    <p className="text-sm">No saved snapshots yet</p>
                    <p className="text-xs opacity-75">Generate backgrounds from snapshots to save them here</p>
                  </div>
                );
              }

              return savedSnapshots.map((snapshot) => {
                if (galleryView === 'list') {
                  return (
                    <div key={snapshot.id} className="relative group flex items-center gap-2 p-2 hover:bg-white/10 rounded">
                      <button
                        onClick={() => setSelectedSnapshotForPreview(snapshot)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                          <img
                            src={snapshot.url}
                            alt={snapshot.prompt}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{snapshot.prompt}</p>
                          <p className="text-xs text-gray-400">{new Date(snapshot.timestamp).toLocaleDateString()}</p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const link = document.createElement('a')
                          link.href = snapshot.url
                          link.download = `snapshot-${snapshot.timestamp}.jpg`
                          link.click()
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white hover:text-gray-300 mr-1"
                        title="Download snapshot"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmModal({
                            isOpen: true,
                            action: () => {
                              const newSnapshots = savedSnapshots.filter(s => s.id !== snapshot.id)
                              setSavedSnapshots(newSnapshots)
                              localStorage.setItem('savedSnapshots', JSON.stringify(newSnapshots))
                            },
                            message: 'Delete this snapshot?'
                          })
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400"
                        title="Delete snapshot"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                } else {
                  return (
                    <div key={snapshot.id} className="relative group h-fit">
                      <button
                        onClick={() => setSelectedSnapshotForPreview(snapshot)}
                        className="w-full text-left"
                      >
                        <div className="relative w-full aspect-video rounded overflow-hidden bg-gray-900">
                          <img
                            src={snapshot.url}
                            alt={snapshot.prompt}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="mt-1 px-1">
                          <p className="text-xs text-white truncate">{snapshot.prompt}</p>
                          <p className="text-xs text-gray-400">{new Date(snapshot.timestamp).toLocaleDateString()}</p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const link = document.createElement('a')
                          link.href = snapshot.url
                          link.download = `snapshot-${snapshot.timestamp}.jpg`
                          link.click()
                        }}
                        className="absolute top-1 right-9 bg-black/70 hover:bg-black text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Download snapshot"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmModal({
                            isOpen: true,
                            action: () => {
                              const newSnapshots = savedSnapshots.filter(s => s.id !== snapshot.id)
                              setSavedSnapshots(newSnapshots)
                              localStorage.setItem('savedSnapshots', JSON.stringify(newSnapshots))
                            },
                            message: 'Delete this snapshot?'
                          })
                        }}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Delete snapshot"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                }
              });
            }
          })()}
            </div>
          </div>
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-black rounded-lg p-6 max-w-md w-full my-8">
            <h2 className="text-white text-xl font-bold mb-4">Generate Custom Texture</h2>

            <div className="mb-4">
              <label className="text-white text-sm block mb-2">AI Model:</label>
              <select
                className="w-full bg-black border border-white text-white rounded px-3 py-2 text-sm"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isGenerating}
              >
                <option value="nano-banana">nano banana pro (default)</option>
                <option value="flux-kontext">Flux Kontext MULTI-IMAGE MAX (via replicate api)</option>
                <option value="openai-image">OPEN AI IMAGE</option>
              </select>
            </div>

            
            <div className="mb-4">
              <label className="text-white text-sm block mb-2">Upload Logo (optional):</label>
              <div className="flex gap-2 items-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setLogoFile(file)
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setLogoPreview(reader.result as string)
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                  className="hidden"
                  id="logo-upload"
                  disabled={isGenerating}
                />
                <label 
                  htmlFor="logo-upload" 
                  className="bg-white hover:bg-black hover:text-white text-black border border-black rounded px-4 py-2 text-sm cursor-pointer"
                >
                  Choose Logo
                </label>
                {logoPreview && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoPreview} alt="Logo preview" className="h-12 w-12 object-contain rounded" />
                    <button
                      onClick={() => {
                        setLogoFile(null)
                        setLogoPreview(null)
                      }}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mb-4">
              <label className="text-white text-sm block mb-2">Upload Reference Image (optional):</label>
              <div className="flex gap-2 items-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setReferenceFile(file)
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setReferencePreview(reader.result as string)
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                  className="hidden"
                  id="reference-upload"
                  disabled={isGenerating}
                />
                <label 
                  htmlFor="reference-upload" 
                  className="bg-white hover:bg-black hover:text-white text-black border border-black rounded px-4 py-2 text-sm cursor-pointer"
                >
                  Choose Reference
                </label>
                {referencePreview && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referencePreview} alt="Reference preview" className="h-12 w-12 object-contain rounded" />
                    <button
                      onClick={() => {
                        setReferenceFile(null)
                        setReferencePreview(null)
                      }}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mb-4">
              <label className="text-white text-sm block mb-2">Describe your custom texture:</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g., A futuristic chrome wrap with neon blue accents and circuit patterns"
                className="w-full bg-black border border-white/20 text-white rounded px-3 py-2 h-24 resize-none text-sm"
                disabled={isGenerating}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!prompt.trim()) return
                  
                  setIsGenerating(true)
                  try {
                    // Convert files to base64 if they exist
                    const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
                      const reader = new FileReader()
                      reader.readAsDataURL(file)
                      reader.onload = () => resolve(reader.result as string)
                      reader.onerror = error => reject(error)
                    })
                    
                    const logoBase64 = logoFile ? await toBase64(logoFile) : null
                    const referenceBase64 = referenceFile ? await toBase64(referenceFile) : null
                    
                    const response = await fetch('/api/generate-texture', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        prompt,
                        baseTexture: null,
                        logo: logoBase64,
                        reference: referenceBase64,
                        model: selectedModel,
                      }),
                    })

                    if (!response.ok) {
                      const errorData = await response.text()
                      console.error('Generation failed:', errorData)
                      throw new Error(`Generation failed: ${response.status} - ${errorData}`)
                    }
                    
                    const data = await response.json()
                    
                    // Add generated texture to the gallery
                    const newTexture = {
                      id: data.filename,
                      name: `AI: ${prompt.slice(0, 20)}...`,
                      thumbnail: data.thumbnailData || data.thumbnail || `/${data.filename}`,
                      isGenerated: true as const,
                      // Store the full image data for texture mapping
                      imageData: data.imageData || null
                    }
                    
                    // If we have base64 data, use it for both thumbnail and main texture
                    if (data.imageData) {
                      newTexture.thumbnail = data.thumbnailData || data.imageData
                    }
                    
                    // Add to recently generated set to protect from immediate validation
                    setRecentlyGeneratedTextures(prev => new Set([...prev, data.filename]))

                    // Use React's state update callback pattern to ensure texture is in array before applying
                    setGeneratedTextures(prev => {
                      const updated = [...prev, newTexture]
                      // Apply the texture after ensuring it's in the array
                      // Use requestAnimationFrame to ensure state has been committed
                      requestAnimationFrame(() => {
                        setInternalTexture(data.filename)
                      })
                      return updated
                    })

                    // Save to Firebase in the background if the function is available
                    if (onSaveAITexture && data.imageData) {
                      // Save asynchronously without blocking the UI update
                      onSaveAITexture(
                        data.imageData,
                        `AI_${Date.now()}`,
                        prompt
                      ).then(firebaseUrl => {
                        // Optionally update to use Firebase URL for consistency
                        // But keep using the local data that's already working
                      }).catch(error => {
                        console.error('Failed to save AI texture to Firebase:', error)
                        // Texture is already applied locally, so no need to do anything
                      })
                    }

                    setShowGenerateModal(false)
                    setPrompt('')
                    setLogoFile(null)
                    setLogoPreview(null)
                    setReferenceFile(null)
                    setReferencePreview(null)
                  } catch (error) {
                    console.error('Generation error:', error)
                    if ((error as Error).message?.includes('500')) {
                      setAlertModal({
                        isOpen: true,
                        message: 'AI texture generation requires a Google AI API key. Please add GOOGLE_AI_API_KEY to your .env.local file.',
                        type: 'error'
                      })
                    } else {
                      setAlertModal({
                        isOpen: true,
                        message: 'Failed to generate texture. Please try again.',
                        type: 'error'
                      })
                    }
                  } finally {
                    setIsGenerating(false)
                  }
                }}
                disabled={isGenerating || !prompt.trim()}
                className="flex-1 bg-[#ff00cb] hover:bg-[#ff00cb]/80 disabled:bg-gray-500 disabled:opacity-50 text-white rounded px-4 py-2 font-semibold transition-colors"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
              
              <button
                onClick={() => {
                  setShowGenerateModal(false)
                  setPrompt('')
                  setLogoFile(null)
                  setLogoPreview(null)
                  setReferenceFile(null)
                  setReferencePreview(null)
                }}
                disabled={isGenerating}
                className="flex-1 bg-black hover:bg-white hover:text-black border border-white/20 disabled:bg-black text-white rounded px-4 py-2 font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
            
            {isGenerating && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                <p className="text-white text-sm mt-2">Creating your custom texture...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Design Editor Modal - Full Screen */}
      {showUVPanelEditor && (
        <div className="fixed inset-0 bg-black z-50">
          <UVPanelEditor
            onComplete={handleUVPanelComplete}
            userId={userId || undefined}
            existingDesign={editingTexture}
            flagColor={flagColor}
            onFlagColorChange={setFlagColor}
          />
          <button
            onClick={() => {
              setShowUVPanelEditor(false)
              setEditingTexture(null)
            }}
            className="absolute top-4 right-4 z-50 text-white hover:text-gray-300 transition-colors bg-gray-900 rounded-full p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}


      {/* Background Generate Modal */}
      {showBackgroundModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-black rounded-lg p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-bold">Background Editor</h2>
              <button
                onClick={() => {
                  setShowBackgroundModal(false)
                  setBackgroundPrompt('')
                }}
                disabled={isGeneratingBackground}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {/* Background Color Picker */}
              <label className="relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 border-yellow-600 hover:border-yellow-400 cursor-pointer">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => {
                    setBackgroundColor(e.target.value)
                    setBackgroundImage(null)
                    setSkyboxPreset(null)
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-full h-20 flex flex-col items-center justify-center" style={{ backgroundColor }}>
                  <svg className="w-6 h-6 text-white mb-1 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  <span className="text-white text-xs font-semibold drop-shadow-lg">Background</span>
                </div>
              </label>

              {/* Upload Background */}
              <label className="relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 border-gray-600 bg-gray-700 hover:bg-gray-600 text-white cursor-pointer">
                <input
                  type="file"
                  accept="image/*,.exr,.hdr"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        const dataUrl = reader.result as string
                        const uploadId = `uploaded_bg_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`

                        // Add to uploaded backgrounds library
                        const newUploadedBg = {
                          id: uploadId,
                          url: dataUrl,
                          name: file.name
                        }
                        setUploadedBackgrounds(prev => [...prev, newUploadedBg])
                        setBackgroundImage(dataUrl)
                        setSkyboxPreset(null)
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                  className="hidden"
                />
                <div className="w-full h-20 flex flex-col items-center justify-center">
                  <svg className="w-6 h-6 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-white text-xs font-semibold">Upload</span>
                </div>
              </label>

              {/* Dark Preset */}
              <button
                onClick={() => {
                  setBackgroundImage(null)
                  setBackgroundColor('#1a1a1a')
                  setSkyboxPreset(null)
                }}
                className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                  backgroundColor === '#1a1a1a' && !backgroundImage && !skyboxPreset
                    ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                    : 'border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="w-full h-20 bg-gray-800 flex flex-col items-center justify-center">
                  <span className="text-white text-xs font-semibold">Dark</span>
                </div>
              </button>

              {/* Sky Preset */}
              <button
                onClick={() => {
                  setBackgroundImage(null)
                  setBackgroundColor('#1a1a1a')
                  setSkyboxPreset('park')
                }}
                className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                  skyboxPreset === 'park' && !backgroundImage
                    ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                    : 'border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="w-full h-20 bg-gradient-to-b from-blue-400 to-green-300 flex flex-col items-center justify-center">
                  <span className="text-white text-xs font-semibold">Natural Sky</span>
                </div>
              </button>
            </div>

            {/* AI Generation Section */}
            <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-3">Generate AI Background</h3>
              <div className="mb-4">
                <label className="text-white text-sm block mb-2">Describe your background:</label>
                <textarea
                  value={backgroundPrompt}
                  onChange={(e) => setBackgroundPrompt(e.target.value)}
                  placeholder="E.g., Professional studio with soft gradient, Abstract geometric patterns, Natural sunset landscape..."
                  className="w-full bg-black border border-white/20 text-white rounded px-3 py-2 h-24 resize-none text-sm"
                  disabled={isGeneratingBackground}
                />
              </div>

              <button
                onClick={async () => {
                  if (!backgroundPrompt.trim()) return

                  setIsGeneratingBackground(true)
                  try {
                    const response = await fetch('/api/generate-background', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        prompt: backgroundPrompt,
                      }),
                    })

                    if (!response.ok) throw new Error('Generation failed')

                    const data = await response.json()

                    // Add generated background to the gallery
                    const newBackground = {
                      id: data.filename,
                      url: data.imageData || `/${data.filename}`
                    }
                    setGeneratedBackgrounds(prev => [...prev, newBackground])
                    setBackgroundImage(newBackground.url)
                    setSkyboxPreset(null)
                    setBackgroundPrompt('')
                  } catch (error) {
                    console.error('Background generation error:', error)
                    setAlertModal({
                      isOpen: true,
                      message: 'Failed to generate background. Please check your API key.',
                      type: 'error'
                    })
                  } finally {
                    setIsGeneratingBackground(false)
                  }
                }}
                disabled={isGeneratingBackground || !backgroundPrompt.trim()}
                className="w-full bg-[#ff00cb] hover:bg-[#ff00cb]/80 disabled:bg-gray-500 disabled:opacity-50 text-white rounded px-4 py-2 font-semibold transition-colors"
              >
                {isGeneratingBackground ? 'Generating...' : 'Generate Background'}
              </button>

              {isGeneratingBackground && (
                <div className="mt-4 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <p className="text-white text-sm mt-2">Creating your background...</p>
                </div>
              )}
            </div>

            {/* Generated Backgrounds */}
            {generatedBackgrounds.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white text-lg font-semibold mb-3">Generated Backgrounds</h3>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {generatedBackgrounds.map((bg) => (
                    <div key={bg.id} className="relative group">
                      <button
                        onClick={() => {
                          setBackgroundImage(bg.url)
                          setSkyboxPreset(null)
                        }}
                        className={`relative overflow-hidden rounded-lg border-2 transition-all w-full ${
                          backgroundImage === bg.url
                            ? 'border-blue-400 shadow-lg shadow-blue-400/30'
                            : 'border-gray-600 hover:border-gray-400'
                        }`}
                      >
                        <div className="aspect-video">
                          <img
                            src={bg.url}
                            alt="Generated background"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setGeneratedBackgrounds(prev => prev.filter(b => b.id !== bg.id))
                          if (backgroundImage === bg.url) {
                            setBackgroundImage(null)
                          }
                        }}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Delete background"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uploaded Backgrounds */}
            {uploadedBackgrounds.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white text-lg font-semibold mb-3">Uploaded Backgrounds</h3>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {uploadedBackgrounds.map((bg) => (
                    <div key={bg.id} className="relative group">
                      <button
                        onClick={() => {
                          setBackgroundImage(bg.url)
                          setSkyboxPreset(null)
                        }}
                        className={`relative overflow-hidden rounded-lg border-2 transition-all w-full ${
                          backgroundImage === bg.url
                            ? 'border-blue-400 shadow-lg shadow-blue-400/30'
                            : 'border-gray-600 hover:border-gray-400'
                        }`}
                        title={bg.name}
                      >
                        <div className="aspect-video">
                          <img
                            src={bg.url}
                            alt={bg.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-1">
                          <span className="text-xs truncate block">{bg.name}</span>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setUploadedBackgrounds(prev => prev.filter(b => b.id !== bg.id))
                          if (backgroundImage === bg.url) {
                            setBackgroundImage(null)
                          }
                        }}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Delete background"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Floor Color Section */}
            <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-3">Floor Color</h3>

              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Asphalt (Default) */}
                <button
                  onClick={() => setFloorMode('asphalt')}
                  className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                    floorMode === 'asphalt'
                      ? 'border-blue-400 shadow-lg shadow-blue-400/30'
                      : 'border-gray-600 hover:border-gray-400'
                  }`}
                >
                  <div className="w-full h-20 bg-gradient-to-br from-gray-600 to-gray-800 flex flex-col items-center justify-center">
                    <span className="text-white text-sm font-semibold">Asphalt</span>
                    <span className="text-gray-300 text-xs">(Default)</span>
                  </div>
                </button>

                {/* Custom Color */}
                <button
                  onClick={() => setFloorMode('custom')}
                  className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                    floorMode === 'custom'
                      ? 'border-blue-400 shadow-lg shadow-blue-400/30'
                      : 'border-gray-600 hover:border-gray-400'
                  }`}
                >
                  <div className="w-full h-20 flex flex-col items-center justify-center" style={{ backgroundColor: floorColor }}>
                    <svg className="w-6 h-6 text-white mb-1 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    <span className="text-white text-xs font-semibold drop-shadow-lg">Custom Color</span>
                  </div>
                </button>
              </div>

              {/* Color Picker - Only shown when Custom Color is selected */}
              {floorMode === 'custom' && (
                <div className="space-y-2">
                  <label className="text-white text-sm block">Choose Floor Color:</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={floorColor}
                      onChange={(e) => setFloorColor(e.target.value)}
                      className="w-16 h-10 rounded cursor-pointer border-2 border-gray-600"
                    />
                    <span className="text-white text-sm font-mono">{floorColor}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Configuration Modal */}
      {showSnapshotModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-black border border-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">High-Quality Snapshot</h3>
              <button
                onClick={() => setShowSnapshotModal(false)}
                className="text-white hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Quality Preset */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Quality Preset</label>
                <select
                  value={snapshotConfig.quality}
                  onChange={(e) => setSnapshotConfig(prev => ({
                    ...prev,
                    quality: e.target.value as 'low' | 'medium' | 'high' | 'ultra',
                    resolution: e.target.value === 'ultra' ? 4096 : 
                               e.target.value === 'high' ? 2048 : 
                               e.target.value === 'medium' ? 1536 : 1024
                  }))}
                  className="w-full bg-black border border-white rounded px-3 py-2 text-white focus:border-white focus:outline-none"
                >
                  <option value="low">Low (1024x1024)</option>
                  <option value="medium">Medium (1536x1536)</option>
                  <option value="high">High (2048x2048)</option>
                  <option value="ultra">Ultra (4096x4096)</option>
                </select>
              </div>

              {/* Custom Resolution */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Resolution: {snapshotConfig.resolution}x{snapshotConfig.resolution}
                </label>
                <input
                  type="range"
                  min="512"
                  max="4096"
                  step="256"
                  value={snapshotConfig.resolution}
                  onChange={(e) => setSnapshotConfig(prev => ({
                    ...prev,
                    resolution: parseInt(e.target.value)
                  }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-white mt-1">
                  <span>512px</span>
                  <span>4096px</span>
                </div>
              </div>

              {/* Anti-aliasing */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">Anti-aliasing</label>
                <input
                  type="checkbox"
                  checked={snapshotConfig.antialias}
                  onChange={(e) => setSnapshotConfig(prev => ({
                    ...prev,
                    antialias: e.target.checked
                  }))}
                  className="rounded"
                />
              </div>

              {/* Environment Quality */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Environment Quality</label>
                <select
                  value={snapshotConfig.environmentQuality}
                  onChange={(e) => setSnapshotConfig(prev => ({
                    ...prev,
                    environmentQuality: e.target.value as 'low' | 'medium' | 'high'
                  }))}
                  className="w-full bg-black border border-white rounded px-3 py-2 text-white focus:border-white focus:outline-none"
                >
                  <option value="low">Low (64px)</option>
                  <option value="medium">Medium (256px)</option>
                  <option value="high">High (512px)</option>
                </select>
              </div>

              {/* AI Background Generation Section */}
              <div className="border-t border-white/20 pt-4">
                <h4 className="text-sm font-semibold text-white mb-2">Generate AI Background</h4>
                <p className="text-xs text-gray-400 mb-3">Use your snapshot to create a custom AI background</p>

                {/* Sidewalk Presets */}
                <div className="mb-3">
                  <label className="text-xs text-gray-400 block mb-2">Quick Sidewalk Presets</label>
                  <div className="grid grid-cols-3 gap-2">
                    {/* LA Sidewalk */}
                    <button
                      onClick={() => setSnapshotBackgroundPrompt('Add this robot onto a scene on a sidewalk in Los Angeles with palm trees, warm sunny lighting, urban California street scene, modern aesthetic')}
                      className="px-2 py-2 rounded text-xs bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400 text-white font-semibold transition-colors"
                      disabled={isGeneratingSnapshotBackground}
                    >
                      🌴 LA
                    </button>

                    {/* Chicago Sidewalk */}
                    <button
                      onClick={() => setSnapshotBackgroundPrompt('Add this robot onto a scene on a sidewalk in Chicago with urban architecture, downtown city street, modern skyscrapers, Midwest urban atmosphere')}
                      className="px-2 py-2 rounded text-xs bg-gradient-to-r from-blue-600 to-gray-600 hover:from-blue-500 hover:to-gray-500 text-white font-semibold transition-colors"
                      disabled={isGeneratingSnapshotBackground}
                    >
                      🏙️ Chicago
                    </button>

                    {/* Miami Beach Sidewalk */}
                    <button
                      onClick={() => setSnapshotBackgroundPrompt('Add this robot onto a scene on a sidewalk in Miami Beach with ocean view, art deco buildings, tropical vibes, sunny beach atmosphere, pastel colors')}
                      className="px-2 py-2 rounded text-xs bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-white font-semibold transition-colors"
                      disabled={isGeneratingSnapshotBackground}
                    >
                      🏖️ Miami
                    </button>
                  </div>
                </div>

                {/* Prompt Input */}
                <textarea
                  value={snapshotBackgroundPrompt}
                  onChange={(e) => setSnapshotBackgroundPrompt(e.target.value)}
                  placeholder="Describe where to place the robot... (e.g., 'Add this robot onto a sidewalk in Tokyo at night with neon lights', 'Place this robot in a desert landscape with sand dunes')"
                  className="w-full bg-black border border-white/20 text-white rounded px-3 py-2 h-20 resize-none text-sm mb-3"
                  disabled={isGeneratingSnapshotBackground}
                />

                {/* Reference Image Upload */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 block">Optional: Add reference image for style</label>
                  <div className="flex gap-2">
                    <label className="flex-1 relative overflow-hidden rounded border border-white/20 hover:border-white bg-gray-900 cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setReferenceImageFile(file)
                            const reader = new FileReader()
                            reader.onloadend = () => {
                              setReferenceImagePreview(reader.result as string)
                            }
                            reader.readAsDataURL(file)
                          }
                        }}
                        className="hidden"
                        disabled={isGeneratingSnapshotBackground}
                      />
                      <div className="w-full h-12 flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-white text-xs">
                          {referenceImageFile ? 'Change Image' : 'Upload Reference'}
                        </span>
                      </div>
                    </label>
                    {referenceImageFile && (
                      <button
                        onClick={() => {
                          setReferenceImageFile(null)
                          setReferenceImagePreview(null)
                        }}
                        className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded border border-red-500/50 text-xs transition-colors"
                        disabled={isGeneratingSnapshotBackground}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {referenceImagePreview && (
                    <div className="relative w-full h-24 rounded border border-white/20 overflow-hidden bg-gray-900">
                      <img
                        src={referenceImagePreview}
                        alt="Reference preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSnapshotModal(false)}
                className="flex-1 px-4 py-2 bg-white hover:bg-black hover:text-white text-black border border-black rounded transition-colors"
                disabled={isGeneratingSnapshotBackground}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSnapshotModal(false)
                  downloadHighQualitySnapshot()
                }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 rounded transition-colors"
                disabled={isGeneratingSnapshotBackground}
              >
                Download Snapshot
              </button>
              <button
                onClick={async () => {
                  if (!snapshotBackgroundPrompt.trim()) {
                    setAlertModal({
                      isOpen: true,
                      message: 'Please enter a prompt for the AI background',
                      type: 'error'
                    })
                    return
                  }

                  setIsGeneratingSnapshotBackground(true)
                  try {
                    // First, capture the current scene
                    const snapshotData = await captureSceneSnapshot()
                    if (!snapshotData) {
                      throw new Error('Failed to capture scene snapshot')
                    }

                    // Convert reference image to base64 if provided
                    let referenceImageData: string | null = null
                    if (referenceImageFile) {
                      referenceImageData = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onloadend = () => resolve(reader.result as string)
                        reader.onerror = reject
                        reader.readAsDataURL(referenceImageFile)
                      })
                    }

                    // Call the new API endpoint with the snapshot, prompt, and optional reference image
                    const response = await fetch('/api/generate-snapshot-background', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        snapshotImage: snapshotData,
                        prompt: snapshotBackgroundPrompt,
                        referenceImage: referenceImageData,
                      }),
                    })

                    if (!response.ok) throw new Error('Background generation failed')

                    const data = await response.json()

                    // Store the generated background and show preview
                    setGeneratedSnapshotBackground({
                      url: data.imageData || `/${data.filename}`,
                      prompt: snapshotBackgroundPrompt
                    })
                    setShowSnapshotModal(false)
                    setShowBackgroundPreviewModal(true)

                    // Clear reference image after successful generation
                    setReferenceImageFile(null)
                    setReferenceImagePreview(null)
                  } catch (error) {
                    console.error('Background generation error:', error)
                    setAlertModal({
                      isOpen: true,
                      message: 'Failed to generate background. Please try again.',
                      type: 'error'
                    })
                  } finally {
                    setIsGeneratingSnapshotBackground(false)
                  }
                }}
                disabled={isGeneratingSnapshotBackground || !snapshotBackgroundPrompt.trim()}
                className="flex-1 px-4 py-2 bg-[#ff00cb] hover:bg-[#ff00cb]/80 disabled:bg-gray-500 disabled:opacity-50 text-white rounded transition-colors font-semibold"
              >
                {isGeneratingSnapshotBackground ? 'Generating...' : 'Generate AI Background'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Preview Modal with Save/Retry */}
      {showBackgroundPreviewModal && generatedSnapshotBackground && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-black border border-white rounded-lg p-6 max-w-3xl w-full">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Generated Background Preview</h3>
                <p className="text-sm text-gray-400 mt-1">Prompt: {generatedSnapshotBackground.prompt}</p>
              </div>
              <button
                onClick={() => {
                  setShowBackgroundPreviewModal(false)
                  setGeneratedSnapshotBackground(null)
                  setSnapshotBackgroundPrompt('')
                }}
                className="text-white hover:text-gray-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview Image */}
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-900 mb-4">
              <img
                src={generatedSnapshotBackground.url}
                alt="Generated background preview"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  // Retry - go back to snapshot modal with existing prompt
                  setShowBackgroundPreviewModal(false)
                  setShowSnapshotModal(true)
                }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 rounded transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry with New Prompt
              </button>
              <button
                onClick={() => {
                  // Save the snapshot to saved snapshots
                  const newSnapshot = {
                    id: `saved_snapshot_${Date.now()}`,
                    url: generatedSnapshotBackground.url,
                    prompt: generatedSnapshotBackground.prompt,
                    timestamp: Date.now()
                  }
                  const updatedSnapshots = [...savedSnapshots, newSnapshot]
                  setSavedSnapshots(updatedSnapshots)

                  // Save to localStorage
                  localStorage.setItem('savedSnapshots', JSON.stringify(updatedSnapshots))

                  // Close modal and show success
                  setShowBackgroundPreviewModal(false)
                  setGeneratedSnapshotBackground(null)
                  setSnapshotBackgroundPrompt('')

                  // Switch to saved snapshots tab
                  setActiveLibraryTab('saved-snapshots')

                  setAlertModal({
                    isOpen: true,
                    message: 'Snapshot saved successfully! View it in the Snapshots tab.',
                    type: 'success'
                  })
                }}
                className="flex-1 px-4 py-2 bg-[#ff00cb] hover:bg-[#ff00cb]/80 text-white rounded transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Snapshot Preview Modal */}
      {selectedSnapshotForPreview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-black border border-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Snapshot Preview</h3>
                <p className="text-sm text-gray-400 mt-1">{selectedSnapshotForPreview.prompt}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Saved on {new Date(selectedSnapshotForPreview.timestamp).toLocaleDateString()} at {new Date(selectedSnapshotForPreview.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedSnapshotForPreview(null)}
                className="text-white hover:text-gray-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview Image */}
            <div className="relative w-full rounded-lg overflow-hidden bg-gray-900 mb-4">
              <img
                src={selectedSnapshotForPreview.url}
                alt={selectedSnapshotForPreview.prompt}
                className="w-full h-auto object-contain max-h-[60vh]"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedSnapshotForPreview(null)}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 rounded transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = selectedSnapshotForPreview.url
                  link.download = `snapshot-${selectedSnapshotForPreview.timestamp}.jpg`
                  link.click()
                }}
                className="flex-1 px-4 py-2 bg-[#ff00cb] hover:bg-[#ff00cb]/80 text-white rounded transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download to Device
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false })}
        onConfirm={() => {
          if (confirmModal.action) {
            confirmModal.action()
          }
        }}
        title="Confirm Delete"
        message={confirmModal.message || 'Are you sure you want to delete this item?'}
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

      {/* Rename Modal */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-xl font-semibold mb-4 text-white">Rename Design</h3>
            <input
              type="text"
              value={newTextureName}
              onChange={(e) => setNewTextureName(e.target.value)}
              className="w-full bg-black border border-gray-600 text-white text-sm rounded px-3 py-2 mb-4"
              placeholder="Enter new name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTextureName.trim() && renameModal.textureId && onRenameUserTexture) {
                  onRenameUserTexture(renameModal.textureId, newTextureName.trim());
                  setRenameModal({ isOpen: false });
                }
              }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRenameModal({ isOpen: false })}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newTextureName.trim() && renameModal.textureId && onRenameUserTexture) {
                    onRenameUserTexture(renameModal.textureId, newTextureName.trim());
                    setRenameModal({ isOpen: false });
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!newTextureName.trim()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {userId && userEmail && (
        <>
          <PublishModal
            isOpen={showPublishModal}
            onClose={() => setShowPublishModal(false)}
            captureThumbnail={captureThumbnail}
            sceneData={{
              texture: (() => {
                // If currentTexture is a user texture ID, find its URL
                const userTexture = userTextures.find(t => t.id === currentTexture);
                if (userTexture) {
                  return userTexture.url;
                }

                // If it's a generated texture, find its URL
                const generatedTexture = generatedTextures.find(t => t.id === currentTexture);
                if (generatedTexture) {
                  const textureUrl = generatedTexture.imageData || `/${generatedTexture.id}`;
                  return textureUrl;
                }

                // Otherwise it's a preset texture or local file
                return currentTexture;
              })(),
              backgroundColor,
              backgroundImage,
              numberOfUnits,
              sceneRotation,
              scenePosition,

              // Camera settings
              cameraAngle: currentCameraAngle,
              cameraPosition: {
                x: cameraPresets[currentCameraAngle].position[0],
                y: cameraPresets[currentCameraAngle].position[1],
                z: cameraPresets[currentCameraAngle].position[2]
              },
              cameraTarget: {
                x: cameraPresets[currentCameraAngle].target[0],
                y: cameraPresets[currentCameraAngle].target[1],
                z: cameraPresets[currentCameraAngle].target[2]
              },

              // Animation settings
              isRotating,
              rotationSpeed,

              // Scene elements visibility
              showPerson,
              showGroundPlane: true, // Always show ground in published scenes

              // Environment settings
              environmentPreset: 'sunset',
              environmentIntensity: 1.5,
              backgroundIntensity: 1.5,

              // Lighting settings (matching current scene defaults)
              ambientLightIntensity: 0.4,
              ambientLightColor: '#ffeedd',
              directionalLightIntensity: 1.8,
              directionalLightPosition: { x: 5, y: 15, z: 5 },
              directionalLightColor: '#fffaf0',
              hemisphereIntensity: 0.6,

              // Shadow settings
              shadowsEnabled: true,
              shadowQuality: 4096
            }}
            userId={userId}
            userEmail={userEmail}
            onPublished={(sceneId) => {
            }}
          />

        </>
      )}
    </div>
  )
}