'use client'

import { useRef, useState, useEffect, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, useGLTF, useFBX, Preload, AdaptiveDpr, AdaptiveEvents, PerformanceMonitor, ContactShadows, useTexture } from '@react-three/drei'
import { Group } from 'three'
import * as THREE from 'three'
import { textureCache } from '@/lib/cacheManager'
import { useTexturePreloader } from '@/hooks/useTexturePreloader'
import CachedImage from '@/components/CachedImage'

const defaultTextures = [
  { id: 'blank-waymo.png', name: 'Blank White', thumbnail: null }
]

// Image preloader with progressive loading and caching
function useProgressiveTexture(texturePath: string | null, generatedTextures: Array<{ id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string }>) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const loadTextureWithCache = async (path: string) => {
      // Check if texture is already cached
      const cachedImage = textureCache.getCachedImage(path)

      if (cachedImage) {
        // Use cached image directly
        const cachedTexture = new THREE.Texture(cachedImage)
        cachedTexture.flipY = false
        cachedTexture.wrapS = THREE.RepeatWrapping
        cachedTexture.wrapT = THREE.RepeatWrapping
        cachedTexture.minFilter = THREE.LinearMipmapLinearFilter
        cachedTexture.magFilter = THREE.LinearFilter
        cachedTexture.generateMipmaps = true
        cachedTexture.anisotropy = 4
        cachedTexture.needsUpdate = true
        return cachedTexture
      }

      // Load and cache if not in cache
      const img = await textureCache.loadImage(path)
      const newTexture = new THREE.Texture(img)
      newTexture.flipY = false
      newTexture.wrapS = THREE.RepeatWrapping
      newTexture.wrapT = THREE.RepeatWrapping
      newTexture.minFilter = THREE.LinearMipmapLinearFilter
      newTexture.magFilter = THREE.LinearFilter
      newTexture.generateMipmaps = true
      newTexture.anisotropy = 4
      newTexture.needsUpdate = true
      return newTexture
    }

    if (!texturePath) {
      // Load blank white texture as fallback
      setIsLoading(true)
      loadTextureWithCache('/blank-waymo.png').then(loadedTexture => {
        setTexture(loadedTexture)
        setIsLoading(false)
      })
      return
    }

    setIsLoading(true)
    const loader = new THREE.TextureLoader()
    
    // Handle async texture validation
    const loadTexture = async () => {
      // For AI-generated textures, try loading directly and let the loader handle errors
      // This avoids race conditions where the file might not be immediately available
      
      // Check if this is an uploaded UV mock or AI-generated texture with base64 data
      const base64Texture = generatedTextures.find(t => t.id === texturePath && (texturePath.startsWith('uv_mock_') || texturePath.startsWith('ai_generated_')))
      
      if (base64Texture && (base64Texture.imageData || (base64Texture.thumbnail && base64Texture.thumbnail.startsWith('data:')))) {
        // Load from base64 data URL - prioritize full imageData over thumbnail
        const textureSource = base64Texture.imageData || base64Texture.thumbnail
        loader.load(
          textureSource,
          (loadedTexture) => {
            loadedTexture.flipY = false
            loadedTexture.wrapS = THREE.RepeatWrapping
            loadedTexture.wrapT = THREE.RepeatWrapping
            loadedTexture.minFilter = THREE.LinearMipmapLinearFilter
            loadedTexture.magFilter = THREE.LinearFilter
            loadedTexture.generateMipmaps = true
            loadedTexture.anisotropy = 4
            // Enhance texture vibrancy
            loadedTexture.colorSpace = THREE.SRGBColorSpace
            loadedTexture.offset.set(0, 0)
            loadedTexture.repeat.set(1, 1)
            setTexture(loadedTexture)
            setIsLoading(false)
          },
          undefined,
          (error) => {
            console.error('Error loading base64 texture:', texturePath, error)
            setIsLoading(false)
            // Set a fallback texture or null to prevent infinite loading
            setTexture(null)
          }
        )
      } else {
        // For Firebase Storage URLs, use them directly. For local files, add the leading slash
        const originalPath = texturePath.startsWith('http') || texturePath.startsWith('https')
          ? texturePath
          : `/${texturePath}`

        // Load texture directly
        loader.load(
          originalPath,
          (loadedTexture) => {
            loadedTexture.flipY = false
            loadedTexture.wrapS = THREE.RepeatWrapping
            loadedTexture.wrapT = THREE.RepeatWrapping
            loadedTexture.minFilter = THREE.LinearMipmapLinearFilter
            loadedTexture.magFilter = THREE.LinearFilter
            loadedTexture.generateMipmaps = true
            loadedTexture.anisotropy = 4
            // Enhance texture vibrancy
            loadedTexture.colorSpace = THREE.SRGBColorSpace
            loadedTexture.offset.set(0, 0)
            loadedTexture.repeat.set(1, 1)
            setTexture(loadedTexture)
            setIsLoading(false)
          },
          undefined,
          (error) => {
            console.error('Error loading texture:', texturePath, error)
            setIsLoading(false)
            
            // For AI-generated textures that fail to load, try fallback to Waymo UV template
            if (texturePath && texturePath.startsWith('ai_generated_')) {
              console.log('Falling back to UV template for missing AI texture:', texturePath)
              loader.load(
                '/waymo-uv-template.png',
                (fallbackTexture) => {
                  fallbackTexture.flipY = false
                  fallbackTexture.wrapS = THREE.RepeatWrapping
                  fallbackTexture.wrapT = THREE.RepeatWrapping
                  fallbackTexture.minFilter = THREE.LinearMipmapLinearFilter
                  fallbackTexture.magFilter = THREE.LinearFilter
                  fallbackTexture.generateMipmaps = true
                  fallbackTexture.anisotropy = 4
                  // Enhance texture vibrancy
                  fallbackTexture.colorSpace = THREE.SRGBColorSpace
                  fallbackTexture.offset.set(0, 0)
                  fallbackTexture.repeat.set(1, 1)
                  setTexture(fallbackTexture)
                },
                undefined,
                () => {
                  // If even the fallback fails, set to null
                  setTexture(null)
                }
              )
            } else {
              // Set a fallback texture or null to prevent infinite loading
              setTexture(null)
            }
          }
        )
      }
    }
    
    // Call the async function
    loadTexture()
  }, [texturePath, generatedTextures])

  return { texture, isLoading }
}

// Camera controller component for smooth transitions with manual rotation support
function CameraController({ position, target }: {
  position: [number, number, number],
  target: [number, number, number]
}) {
  useFrame((state) => {
    // Always use preset position, ignore manual rotation for now
    // This ensures camera presets work correctly
    state.camera.position.lerp(new THREE.Vector3(...position), 0.1)
    state.camera.lookAt(...target)
  })

  return null
}

// Background sphere component for wrapping images around environment
function BackgroundSphere({ image }: { image: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(
      image,
      (loadedTexture) => {
        loadedTexture.mapping = THREE.EquirectangularReflectionMapping
        loadedTexture.colorSpace = THREE.SRGBColorSpace
        setTexture(loadedTexture)
      },
      undefined,
      (error) => {
        console.warn('Failed to load background image:', image, error)
        // Don't set texture if loading fails
      }
    )
  }, [image])

  if (!texture) return null

  return (
    <mesh scale={[-50, 50, 50]} position={[0, -1.2, 0]} rotation={[0, 0, 0]}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  )
}

// Ground plane component with gravel texture
function GroundPlane() {
  // Use URL encoding for spaces in the path
  const diffuseMap = useTexture('/Gravel%20Texture/textures/gravel_concrete_02_diff_1k.jpg')
  const displacementMap = useTexture('/Gravel%20Texture/textures/gravel_concrete_02_disp_1k.png')

  // Configure texture wrapping and repeat
  useEffect(() => {
    // Set up diffuse map
    diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping
    diffuseMap.repeat.set(10, 10)
    diffuseMap.anisotropy = 16
    diffuseMap.needsUpdate = true

    // Set up displacement map
    displacementMap.wrapS = displacementMap.wrapT = THREE.RepeatWrapping
    displacementMap.repeat.set(10, 10)
    displacementMap.needsUpdate = true
  }, [diffuseMap, displacementMap])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow castShadow>
      <planeGeometry args={[50, 50, 128, 128]} />
      <meshStandardMaterial
        map={diffuseMap}
        displacementMap={displacementMap}
        displacementScale={0.002}
        roughness={0.85}
        metalness={0.15}
        envMapIntensity={0.3}
        color="#a0a0a0"
      />
    </mesh>
  )
}

function WaymoModel({ currentTexture, isRotating, generatedTextures, numberOfUnits, scenePosition, sceneRotation, rotationSpeed }: { currentTexture: string | null, isRotating: boolean, generatedTextures: Array<{ id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string }>, numberOfUnits: number, scenePosition: { x: number, y: number, z: number }, sceneRotation: { x: number, y: number, z: number }, rotationSpeed: number }) {
  const groupRef = useRef<Group>(null!)
  const individualGroupRefs = useRef<(Group | null)[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const { scene } = useGLTF('/Waymo.glb')
  const { texture, isLoading } = useProgressiveTexture(currentTexture, generatedTextures)
  const rotationDirections = useRef<number[]>([])
  
  // Generate random rotation directions when number of units changes
  useEffect(() => {
    rotationDirections.current = Array.from({ length: numberOfUnits }, () => 
      numberOfUnits > 1 ? (Math.random() > 0.5 ? 1 : -1) : 1
    )
  }, [numberOfUnits])
  
  // Store original materials to avoid recreating them
  const originalMaterials = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map())

  useEffect(() => {
    if (scene) {
      // First pass: store original materials and optimize geometry
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Store original material if not already stored
          if (!originalMaterials.current.has(child)) {
            originalMaterials.current.set(child, child.material)
          }
          
          // Optimize geometry
          if (child.geometry) {
            child.geometry.computeBoundingSphere()
            // Enable frustum culling
            child.frustumCulled = true
            // Reduce geometry complexity if needed
            if (child.geometry.attributes.position.count > 10000) {
              child.castShadow = true
              child.receiveShadow = true
            }
          }
          
          const material = child.material as THREE.Material

          // Only update materials that are named exactly "Full Wrap"
          if (material && material.name === 'Full Wrap') {
            // Always apply a material, never leave it undefined
            // Reuse material if possible, just update the map and properties
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.map = texture
              child.material.metalness = 0.0
              child.material.roughness = 0.95
              child.material.color = new THREE.Color(1.0, 1.0, 1.0)
              // Reduce reflectivity for more matte appearance
              child.material.envMapIntensity = 0.1
              child.material.needsUpdate = true
            } else {
              child.material = new THREE.MeshStandardMaterial({
                map: texture,
                metalness: 0.0,
                roughness: 0.95,
                // Natural color for better texture visibility
                color: new THREE.Color(1.0, 1.0, 1.0),
                transparent: false,
                alphaTest: 0.1,
                // Reduce reflectivity for more matte appearance
                envMapIntensity: 0.1,
              })
            }
          }
        }
      })
    }
  }, [scene, texture])

  useFrame((state, delta) => {
    if (!isDragging && isRotating) {
      // Rotate individual models with their own directions
      individualGroupRefs.current.forEach((ref, index) => {
        if (ref) {
          const direction = rotationDirections.current[index] || 1
          ref.rotation.y += delta * rotationSpeed * 30 * direction
        }
      })
    }
  })

  // Calculate grid layout for multiple units
  const cols = Math.ceil(Math.sqrt(numberOfUnits))
  const rows = Math.ceil(numberOfUnits / cols)
  const spacing = 4.0 // Reduced spacing to make units closer together

  // Calculate offsets to center the grid
  const offsetX = ((cols - 1) * spacing) / 2
  const offsetZ = ((rows - 1) * spacing) / 2

  return (
    <group
      ref={groupRef}
      position={[scenePosition.x, scenePosition.y, scenePosition.z]}
      rotation={[sceneRotation.x, sceneRotation.y, sceneRotation.z]}
      onPointerDown={() => setIsDragging(true)}
      onPointerUp={() => setIsDragging(false)}
      onPointerLeave={() => setIsDragging(false)}
    >
      {Array.from({ length: numberOfUnits }).map((_, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = col * spacing - offsetX
        const z = row * spacing - offsetZ

        return (
          <group
            key={index}
            ref={(el) => { individualGroupRefs.current[index] = el }}
            position={[x, -1.15, z]}
            scale={[1.5, 1.5, 1.5]}
          >
            <primitive object={scene.clone()} />
          </group>
        )
      })}
      {isLoading && (
        <mesh position={[0, 3, 0]}>
          <boxGeometry args={[0.5, 0.1, 0.5]} />
          <meshBasicMaterial color="blue" />
        </mesh>
      )}
    </group>
  )
}


// Person model component for size comparison
function PersonModel() {
  const fbx = useFBX('/3D-guy.fbx')
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)

  useEffect(() => {
    if (fbx) {
      const box = new THREE.Box3().setFromObject(fbx)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())

      console.log('Person model size:', size)
      console.log('Person model center:', center)
      console.log('FBX animations:', fbx.animations)

      // Set up animation if available
      if (fbx.animations && fbx.animations.length > 0) {
        mixerRef.current = new THREE.AnimationMixer(fbx)
        const action = mixerRef.current.clipAction(fbx.animations[0])
        action.play()
        console.log('Playing animation:', fbx.animations[0].name)
      }

      // Apply uniform grey material to all meshes
      let meshIndex = 0
      fbx.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true

          console.log('Mesh found:', child.name, 'Current material:', child.material)

          // Apply uniform light grey material to everything
          child.material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(0xB0B0B0), // Light grey
            specular: new THREE.Color(0x333333),
            shininess: 20,
            side: THREE.DoubleSide,
            flatShading: false
          })

          console.log(`Applied grey material to mesh: ${child.name}`)
          meshIndex++
        }
      })

      console.log(`Total meshes processed: ${meshIndex}`)

      // Center the model at its feet
      const minY = box.min.y
      fbx.position.y = -minY
    }

    return () => {
      // Clean up mixer on unmount
      if (mixerRef.current) {
        mixerRef.current.stopAllAction()
      }
    }
  }, [fbx])

  // Update animation
  useFrame((state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta)
    }
  })

  // Scale for the FBX model - increased by 25%
  const scale = 0.0125

  // Position further to the left of the main model, properly grounded
  return (
    <group position={[-3, -1.15, 0]} scale={[scale, scale, scale]}>
      <primitive object={fbx} />
    </group>
  )
}

// Preload models
useGLTF.preload('/Waymo.glb')
useFBX.preload('/3D-guy.fbx')

// Utility function to check if a texture file exists
async function checkTextureExists(filename: string): Promise<boolean> {
  try {
    const response = await fetch(`/${filename}`, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

import { Texture } from './TextureManager'
import { ConfirmModal, AlertModal } from './CustomModal'
import PublishModal from './PublishModal'

interface ChromeModelProps {
  currentTexture?: string | null;
  onSaveAITexture?: ((base64: string, name: string, prompt?: string) => Promise<string>) | null;
  userTextures?: Texture[];
  onTextureSelect?: (textureUrl: string) => void;
  onDeleteUserTexture?: (textureId: string) => Promise<void>;
  userId?: string | null;
  userEmail?: string | null;
}

export default function ChromeModel({ currentTexture: externalTexture, onSaveAITexture, userTextures = [], onTextureSelect, onDeleteUserTexture, userId, userEmail }: ChromeModelProps) {
  // Initialize texture preloader
  useTexturePreloader()

  // Initialize with blank white texture as default
  const [internalTexture, setInternalTexture] = useState<string>('blank-waymo.png')
  // Use internal texture if external is null or undefined
  const currentTexture = externalTexture !== null && externalTexture !== undefined ? externalTexture : internalTexture

  // Ensure blank texture stays as default
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
  const [galleryMode, setGalleryMode] = useState<'texture' | 'background'>('texture')
  const [galleryView, setGalleryView] = useState<'card' | 'list'>('card')
  const [backgroundColor, setBackgroundColor] = useState('#1a1a1a')
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
  const [skyboxPreset, setSkyboxPreset] = useState<string | null>(null)
  const [showBackgroundModal, setShowBackgroundModal] = useState(false)
  const [backgroundPrompt, setBackgroundPrompt] = useState('')
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false)
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
  const [snapshotConfig, setSnapshotConfig] = useState({
    quality: 'high' as 'low' | 'medium' | 'high' | 'ultra',
    resolution: 2048,
    antialias: true,
    shadows: false,
    environmentQuality: 'medium' as 'low' | 'medium' | 'high'
  })

  // Camera angle presets - adjusted for street level perspective
  const [currentCameraAngle, setCurrentCameraAngle] = useState('threequarter')
  const [cameraRotation, setCameraRotation] = useState({ azimuth: 0, elevation: 0, distance: 5 })

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
        console.log('Cleared uploadedBackgrounds from localStorage due to quota')
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
            console.log('Generated background not found, clearing:', backgroundImage)
            setBackgroundImage(null)
          }
        })
        .catch(() => {
          console.log('Generated background not accessible, clearing:', backgroundImage)
          setBackgroundImage(null)
        })
    }
  }, [backgroundImage])

  const cameraPresets: Record<string, { position: number[], target: number[], name: string }> = {
    front: { position: [0, 0.5, 5], target: [0, -0.5, 0], name: 'Front' },
    side: { position: [5, 0.5, 0], target: [0, -0.5, 0], name: 'Side' },
    back: { position: [0, 0.5, -5], target: [0, -0.5, 0], name: 'Back' },
    topFront: { position: [0, 3, 4], target: [0, -0.5, 0], name: 'Top Front' },
    lowAngle: { position: [0, -0.5, 4], target: [0, -0.3, 0], name: 'Low Angle' },
    threequarter: { position: [3.5, 1, 3.5], target: [0, -0.5, 0], name: '3/4 View' },
    custom: { position: [5, 6, 5], target: [0, -0.5, 0], name: 'Top 3/4' }
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
          setInternalTexture('blank-waymo.png')
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
            console.log('Current texture is missing, resetting to default')
            setInternalTexture('blank-template.png')
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

  // Function to download high-quality canvas snapshot
  const downloadHighQualitySnapshot = async () => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current as HTMLCanvasElement
    // const originalWidth = canvas.width
    // const originalHeight = canvas.height
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
      
      // Capture the high-quality frame
      canvas.toBlob((blob: Blob | null) => {
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

  // Function to download canvas snapshot (opens modal)
  const downloadSnapshot = () => {
    setShowSnapshotModal(true)
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

  // Function to delete generated texture
  const deleteGeneratedTexture = async (textureId: string) => {
    try {
      const response = await fetch('/api/delete-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: textureId })
      })
      
      if (response.ok) {
        // Remove from generated textures list
        setGeneratedTextures(prev => prev.filter(t => t.id !== textureId))
        // If it was selected, clear selection
        if (currentTexture === textureId) {
          setInternalTexture('blank-template.png')
        }
      }
    } catch (error) {
      console.error('Failed to delete texture:', error)
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
          img.src = `/${textureObj.id}`;
          img.onload = () => {
            setPreloadedImages(prev => new Set(prev).add(textureObj.id));
          };
        }
      });
    }
  }, [currentTexture, preloadedImages, presetTextures, generatedTextures])

  return (
    <div className="w-full h-full flex flex-col md:flex-row canvas-container">
      {/* 3D Viewer */}
      <div className="flex-1 relative order-1 md:order-1" style={{ 
        backgroundColor: backgroundColor,
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        <Canvas
          ref={canvasRef}
          camera={{ position: [0, 0, 5 + (Math.sqrt(numberOfUnits) - 1) * 3], fov: 45 }}
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
            position={cameraPresets[currentCameraAngle].position as [number, number, number]}
            target={cameraPresets[currentCameraAngle].target as [number, number, number]}
          />

          <Suspense fallback={null}>
            <WaymoModel currentTexture={currentTexture} isRotating={isRotating} generatedTextures={generatedTextures} numberOfUnits={numberOfUnits} scenePosition={scenePosition} sceneRotation={sceneRotation} rotationSpeed={rotationSpeed} />


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
            <GroundPlane />

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
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-black/80 backdrop-blur-md rounded-lg p-2 z-30">
          <div className="text-white text-sm font-semibold mb-1">Camera Angles</div>
          {Object.entries(cameraPresets).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => {
                setCurrentCameraAngle(key)
                // Reset manual rotation when selecting a preset
                if (key !== 'custom') {
                  setCameraRotation({ azimuth: 0, elevation: 0, distance: 5 })
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

        {/* Bottom Center Controls */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-30">
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
            <>
              <button
                onClick={() => setShowPublishModal(true)}
                className="px-3 py-1 bg-black/50 hover:bg-black/70 text-white rounded text-xs transition-colors flex items-center gap-1"
                title="Publish scene"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.432-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 3.12-9.243 7.342m9.243-7.342v12" />
                </svg>
                Publish
              </button>
            </>
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
                
                {/* Scene Rotation Controls */}
                <div className="space-y-2">
                  <label className="text-white text-xs font-semibold block">Rotation</label>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-4">X:</label>
                      <input
                        type="range"
                        min="-3.14"
                        max="3.14"
                        step="0.1"
                        value={sceneRotation.x}
                        onChange={(e) => setSceneRotation(prev => ({ ...prev, x: parseFloat(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-8 text-right">{(sceneRotation.x * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-4">Y:</label>
                      <input
                        type="range"
                        min="-3.14"
                        max="3.14"
                        step="0.1"
                        value={sceneRotation.y}
                        onChange={(e) => setSceneRotation(prev => ({ ...prev, y: parseFloat(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-8 text-right">{(sceneRotation.y * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-4">Z:</label>
                      <input
                        type="range"
                        min="-3.14"
                        max="3.14"
                        step="0.1"
                        value={sceneRotation.z}
                        onChange={(e) => setSceneRotation(prev => ({ ...prev, z: parseFloat(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-8 text-right">{(sceneRotation.z * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                  </div>
                </div>
                
                {/* Scene Position Controls */}
                <div className="space-y-2">
                  <label className="text-white text-xs font-semibold block">Position</label>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-4">X:</label>
                      <input
                        type="range"
                        min="-5"
                        max="5"
                        step="0.1"
                        value={scenePosition.x}
                        onChange={(e) => setScenePosition(prev => ({ ...prev, x: parseFloat(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-8 text-right">{scenePosition.x.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-4">Y:</label>
                      <input
                        type="range"
                        min="-5"
                        max="5"
                        step="0.1"
                        value={scenePosition.y}
                        onChange={(e) => setScenePosition(prev => ({ ...prev, y: parseFloat(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-8 text-right">{scenePosition.y.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-4">Z:</label>
                      <input
                        type="range"
                        min="-5"
                        max="5"
                        step="0.1"
                        value={scenePosition.z}
                        onChange={(e) => setScenePosition(prev => ({ ...prev, z: parseFloat(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-8 text-right">{scenePosition.z.toFixed(1)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setScenePosition({ x: 0, y: 0, z: 0 })}
                    className="w-full px-2 py-1 bg-white hover:bg-black hover:text-white text-black border border-black rounded text-xs transition-colors mt-2"
                  >
                    Reset Position
                  </button>
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
                          setCameraRotation(prev => ({ ...prev, azimuth: parseFloat(e.target.value) }))
                          setCurrentCameraAngle('custom')
                        }}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-10 text-right">{(cameraRotation.azimuth * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-16">Height:</label>
                      <input
                        type="range"
                        min="-1.57"
                        max="1.57"
                        step="0.05"
                        value={cameraRotation.elevation}
                        onChange={(e) => {
                          setCameraRotation(prev => ({ ...prev, elevation: parseFloat(e.target.value) }))
                          setCurrentCameraAngle('custom')
                        }}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-10 text-right">{(cameraRotation.elevation * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-white text-xs w-16">Distance:</label>
                      <input
                        type="range"
                        min="2"
                        max="15"
                        step="0.5"
                        value={cameraRotation.distance}
                        onChange={(e) => {
                          setCameraRotation(prev => ({ ...prev, distance: parseFloat(e.target.value) }))
                          setCurrentCameraAngle('custom')
                        }}
                        className="flex-1"
                      />
                      <span className="text-white text-xs w-10 text-right">{cameraRotation.distance.toFixed(1)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCameraRotation({ azimuth: 0, elevation: 0, distance: 5 })
                      setCurrentCameraAngle('threequarter')
                    }}
                    className="w-full px-2 py-1 bg-white hover:bg-black hover:text-white text-black border border-black rounded text-xs transition-colors mt-2"
                  >
                    Reset Camera
                  </button>
                </div>

                {/* Reset All Button */}
                <div className="border-t border-white/20 pt-2">
                  <button
                    onClick={() => {
                      setScenePosition({ x: 0, y: 0, z: 0 })
                      setSceneRotation({ x: 0, y: 0, z: 0 })
                      setCameraRotation({ azimuth: 0, elevation: 0, distance: 5 })
                      setCurrentCameraAngle('threequarter')
                    }}
                    className="w-full px-2 py-1 bg-white hover:bg-black hover:text-white text-black border border-black rounded text-xs transition-colors"
                  >
                    Reset All Transforms
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gallery Panel */}
      <div className="w-full md:w-64 h-40 md:h-full bg-black p-4 overflow-hidden order-2 md:order-2 flex flex-col">
        {/* Gallery Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setGalleryMode('texture')}
            className={`flex-1 px-3 py-1 rounded text-sm font-semibold transition-colors ${
              galleryMode === 'texture'
                ? 'bg-white text-black'
                : 'bg-black text-white hover:bg-white hover:text-black'
            }`}
          >
            Texture
          </button>
          <button
            onClick={() => setGalleryMode('background')}
            className={`flex-1 px-3 py-1 rounded text-sm font-semibold transition-colors ${
              galleryMode === 'background'
                ? 'bg-white text-black'
                : 'bg-black text-white hover:bg-white hover:text-black'
            }`}
          >
            Background
          </button>
        </div>

        {galleryMode === 'texture' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white text-lg font-semibold hidden md:block">My Library</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setGalleryView('card')}
                  className={`p-1 rounded ${galleryView === 'card' ? 'bg-white text-black' : 'bg-black text-white'}`}
                  title="Card view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setGalleryView('list')}
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
                ? 'flex md:grid md:grid-cols-2 gap-2'
                : 'flex flex-col gap-1'
            }`}>
          {/* Upload UV Mock button */}
          <label className="relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 border-[#212121]/50 bg-[#212121] hover:bg-[#212121]/80 text-white cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) {
                  // Create a unique filename for the uploaded mock
                  const timestamp = Date.now()
                  const filename = `uv_mock_${timestamp}.jpg`
                  
                  // Read the file and add to textures
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    const newTexture = {
                      id: filename,
                      name: `Upload: ${file.name.slice(0, 15)}...`,
                      thumbnail: reader.result as string,
                      isGenerated: true as const
                    }
                    setGeneratedTextures(prev => [...prev, newTexture])
                    setInternalTexture(filename)
                    
                    // Save the file (would need an upload endpoint in production)
                    // For now, it's stored in memory as base64
                  }
                  reader.readAsDataURL(file)
                }
              }}
              className="hidden"
            />
            <div className="w-24 md:w-full h-24 md:h-20 flex flex-col items-center justify-center">
              <svg className="w-8 h-8 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-white text-xs md:text-sm font-semibold">Upload</span>
            </div>
          </label>
          
          {/* Generate with AI button */}
          <button
            onClick={() => setShowGenerateModal(true)}
            className="relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 border-[#212121]/50 bg-[#212121] hover:bg-[#212121]/80 text-white"
          >
            <div className="w-24 md:w-full h-24 md:h-20 flex flex-col items-center justify-center">
              <svg className="w-8 h-8 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-white text-xs md:text-sm font-semibold">Generate</span>
            </div>
          </button>
          {/* Combine all texture sources */}
          {[...presetTextures.map(t => ({ ...t, isPreset: true })), ...generatedTextures, ...userTextures.map(t => ({
            id: t.url,
            name: t.name,
            thumbnail: t.thumbnailUrl || t.url,
            isUserTexture: true,
            textureId: t.id
          }))].map((textureObj) => {
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
                      if (isUserTexture && onTextureSelect) {
                        onTextureSelect(textureObj.id)
                      } else {
                        // For preset and generated textures
                        setInternalTexture(textureObj.id)
                        // Also notify parent if callback exists
                        if (onTextureSelect) {
                          onTextureSelect(textureObj.id)
                        }
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
                  {(isGenerated || isUserTexture || ('isPreset' in textureObj && textureObj.isPreset)) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isGenerated) {
                          setConfirmModal({
                            isOpen: true,
                            action: () => deleteGeneratedTexture(textureObj.id),
                            message: 'Delete this generated texture?'
                          })
                        } else if (isUserTexture && 'textureId' in textureObj && onDeleteUserTexture) {
                          // Handle user texture deletion through Firebase
                          setConfirmModal({
                            isOpen: true,
                            action: () => onDeleteUserTexture(textureObj.textureId),
                            message: 'Delete this texture from your library?'
                          })
                        } else if ('isPreset' in textureObj && textureObj.isPreset) {
                          // Handle preset texture deletion
                          setConfirmModal({
                            isOpen: true,
                            action: () => deletePresetTexture(textureObj.id),
                            message: 'Delete this preset texture?'
                          })
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            }

            return (
              <div key={textureObj.id} className="relative group flex-shrink-0">
                <button
                  onClick={() => {
                    if (isUserTexture && onTextureSelect) {
                      onTextureSelect(textureObj.id)
                    } else {
                      // For preset and generated textures
                      setInternalTexture(textureObj.id)
                      // Also notify parent if callback exists
                      if (onTextureSelect) {
                        onTextureSelect(textureObj.id)
                      }
                    }
                  }}
                  className={`relative overflow-hidden rounded-lg transition-all w-full h-full ${
                    currentTexture === textureObj.id
                      ? 'border-2 border-white shadow-lg shadow-white/30'
                      : 'hover:opacity-80'
                  }`}
                >
                  {textureObj.thumbnail ? (
                    <CachedImage
                      src={textureObj.thumbnail}
                      alt={`${textureObj.name} logo`}
                      className="w-24 md:w-full h-24 md:h-20 object-cover"
                      priority={currentTexture === textureObj.id}
                    />
                  ) : textureObj.name === 'Blank' ? (
                    <div className="w-24 md:w-full h-24 md:h-20 bg-white" />
                  ) : (
                    <CachedImage
                      src={`/${textureObj.id}`}
                      alt={`Texture ${textureObj.id}`}
                      className="w-24 md:w-full h-24 md:h-20 object-cover"
                      priority={currentTexture === textureObj.id}
                    />
                  )}
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
          })}
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-white text-lg font-semibold mb-2 md:mb-4 hidden md:block">Background</h3>
            <div className="flex md:grid md:grid-cols-2 gap-2 h-full md:h-auto">
              {/* Color Picker */}
              <label className="relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 border-yellow-600 hover:border-yellow-400 cursor-pointer">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => {
                    setBackgroundColor(e.target.value)
                    setBackgroundImage(null)
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-24 md:w-full h-24 md:h-20 flex flex-col items-center justify-center" style={{ backgroundColor }}>
                  <svg className="w-8 h-8 text-white mb-1 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  <span className="text-white text-xs md:text-sm font-semibold drop-shadow-lg">Color</span>
                </div>
              </label>
              
              {/* Upload Background */}
              <label className="relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 border-[#212121]/50 bg-[#212121] hover:bg-[#212121]/80 text-white cursor-pointer">
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
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                  className="hidden"
                />
                <div className="w-24 md:w-full h-24 md:h-20 flex flex-col items-center justify-center">
                  <svg className="w-8 h-8 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-white text-xs md:text-sm font-semibold">Upload</span>
                </div>
              </label>
              
              {/* Generate Background */}
              <button
                onClick={() => setShowBackgroundModal(true)}
                className="relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 border-[#212121]/50 bg-[#212121] hover:bg-[#212121]/80 text-white"
              >
                <div className="w-24 md:w-full h-24 md:h-20 flex flex-col items-center justify-center">
                  <svg className="w-8 h-8 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span className="text-white text-xs md:text-sm font-semibold">Generate</span>
                </div>
              </button>
              
              {/* Preset backgrounds */}
              <button
                onClick={() => {
                  setBackgroundImage(null)
                  setBackgroundColor('#1a1a1a')
                  setSkyboxPreset(null)
                }}
                className={`relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 ${
                  backgroundColor === '#1a1a1a' && !backgroundImage && !skyboxPreset
                    ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                    : 'border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="w-24 md:w-full h-24 md:h-20 bg-black border border-white flex items-center justify-center">
                  <span className="text-white text-xs md:text-sm">Dark</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setBackgroundImage(null)
                  setBackgroundColor('#ffffff')
                  setSkyboxPreset(null)
                }}
                className={`relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 ${
                  backgroundColor === '#ffffff' && !backgroundImage && !skyboxPreset
                    ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                    : 'border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="w-24 md:w-full h-24 md:h-20 bg-white flex items-center justify-center">
                  <span className="text-black text-xs md:text-sm">Light</span>
                </div>
              </button>
              
              <button
                onClick={() => {
                  setBackgroundImage(null)
                  setBackgroundColor('#87CEEB')
                  setSkyboxPreset(null)
                }}
                className={`relative overflow-hidden rounded-lg border-2 transition-all flex-shrink-0 ${
                  backgroundColor === '#87CEEB' && !backgroundImage && !skyboxPreset
                    ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                    : 'border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="w-24 md:w-full h-24 md:h-20 bg-sky-300 flex items-center justify-center">
                  <span className="text-white text-xs md:text-sm">Sky</span>
                </div>
              </button>

              {/* Natural Sky Preset */}
              <button
                onClick={() => setBackgroundImage('/rustig_koppie_puresky_2k.exr')}
                className={`flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  backgroundImage === '/rustig_koppie_puresky_2k.exr'
                    ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                    : 'border-gray-600 hover:border-gray-400'
                }`}
              >
                <div className="w-24 md:w-full h-24 md:h-20 bg-gradient-to-b from-blue-400 to-orange-300 flex items-center justify-center">
                  <span className="text-white text-xs md:text-sm font-semibold">Natural Sky</span>
                </div>
              </button>

              {/* Uploaded Backgrounds */}
              {uploadedBackgrounds.map((bg) => (
                <div key={bg.id} className="relative group flex-shrink-0">
                  <button
                    onClick={() => setBackgroundImage(bg.url)}
                    className={`relative overflow-hidden rounded-lg border-2 transition-all w-full h-full ${
                      backgroundImage === bg.url
                        ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                        : 'border-gray-600 hover:border-gray-400'
                    }`}
                    title={bg.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bg.url}
                      alt={bg.name}
                      className="w-24 md:w-full h-24 md:h-20 object-cover"
                    />
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

              {/* Generated Backgrounds */}
              {generatedBackgrounds.map((bg) => (
                <div key={bg.id} className="relative group flex-shrink-0">
                  <button
                    onClick={() => setBackgroundImage(bg.url)}
                    className={`relative overflow-hidden rounded-lg border-2 transition-all w-full h-full ${
                      backgroundImage === bg.url
                        ? 'border-gray-400 shadow-lg shadow-gray-400/30'
                        : 'border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bg.url}
                      alt="Generated background"
                      className="w-24 md:w-full h-24 md:h-20 object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 text-center">
                      <span>AI Generated</span>
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
            
            {/* Full Color Spectrum Display */}
            <div className="mt-4 p-3 bg-black border border-white rounded-lg">
              <div className="relative h-8 rounded overflow-hidden">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => {
                    setBackgroundColor(e.target.value)
                    setBackgroundImage(null)
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div 
                  className="w-full h-full cursor-pointer rounded"
                  style={{ 
                    background: `linear-gradient(to right, 
                      #ff0000, #ff8800, #ffff00, #88ff00, 
                      #00ff00, #00ff88, #00ffff, #0088ff,
                      #0000ff, #8800ff, #ff00ff, #ff0088, #ff0000)`,
                    position: 'relative'
                  }}
                >
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-white border border-black"
                    style={{ 
                      left: `${backgroundColor && backgroundColor.length > 1 ? ((parseInt(backgroundColor.slice(1), 16) / 0xffffff) * 100) : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
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
                <option value="nano-banana">nano banana (default)</option>
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
                        console.log('AI texture saved to Firebase:', firebaseUrl)
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
      
      {/* Background Generate Modal */}
      {showBackgroundModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-black rounded-lg p-6 max-w-md w-full my-8">
            <h2 className="text-white text-xl font-bold mb-4">Generate Background</h2>
            
            <div className="mb-4">
              <label className="text-white text-sm block mb-2">Describe your background:</label>
              <textarea
                value={backgroundPrompt}
                onChange={(e) => setBackgroundPrompt(e.target.value)}
                placeholder="E.g., Professional studio with soft gradient, Abstract geometric patterns, Natural sunset landscape..."
                className="w-full bg-black border border-white/20 text-white rounded px-3 py-2 h-32 resize-none text-sm"
                disabled={isGeneratingBackground}
              />
            </div>
            
            <div className="flex gap-2">
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
                    setShowBackgroundModal(false)
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
                className="flex-1 bg-[#ff00cb] hover:bg-[#ff00cb]/80 disabled:bg-gray-500 disabled:opacity-50 text-white rounded px-4 py-2 font-semibold transition-colors"
              >
                {isGeneratingBackground ? 'Generating...' : 'Generate'}
              </button>
              
              <button
                onClick={() => {
                  setShowBackgroundModal(false)
                  setBackgroundPrompt('')
                }}
                disabled={isGeneratingBackground}
                className="flex-1 bg-black hover:bg-white hover:text-black border border-white/20 disabled:bg-black text-white rounded px-4 py-2 font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
            
            {isGeneratingBackground && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                <p className="text-white text-sm mt-2">Creating your background...</p>
              </div>
            )}
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
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSnapshotModal(false)}
                className="flex-1 px-4 py-2 bg-white hover:bg-black hover:text-white text-black border border-black rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSnapshotModal(false)
                  downloadHighQualitySnapshot()
                }}
                className="flex-1 px-4 py-2 bg-black hover:bg-white hover:text-black text-white border border-white rounded transition-colors"
              >
                Download Snapshot
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

      {userId && userEmail && (
        <>
          <PublishModal
            isOpen={showPublishModal}
            onClose={() => setShowPublishModal(false)}
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
              scenePosition
            }}
            userId={userId}
            userEmail={userEmail}
            onPublished={(sceneId) => {
              console.log('Scene published with ID:', sceneId)
            }}
          />

        </>
      )}
    </div>
  )
}