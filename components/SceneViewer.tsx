'use client';

import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, useFBX, Preload, useTexture, ContactShadows } from '@react-three/drei';
import { Suspense, useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Group } from 'three';
import { textureCache } from '@/lib/cacheManager';
import WaymoModel from './scene/WaymoModel';
import PersonModel from './scene/PersonModel';
import GroundPlane from './scene/GroundPlane';

// Progressive texture loading hook
function useProgressiveTexture(texturePath: string | null, generatedTextures: Array<{ id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string }>) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const createTexture = (image: HTMLImageElement): THREE.Texture => {
      const newTexture = new THREE.Texture(image)
      newTexture.flipY = false
      newTexture.wrapS = THREE.RepeatWrapping
      newTexture.wrapT = THREE.RepeatWrapping
      newTexture.minFilter = THREE.LinearMipmapLinearFilter
      newTexture.magFilter = THREE.LinearFilter
      newTexture.generateMipmaps = true
      newTexture.anisotropy = 4
      newTexture.colorSpace = THREE.SRGBColorSpace
      newTexture.needsUpdate = true
      return newTexture
    }

    const loadTextureWithCache = async (path: string): Promise<THREE.Texture> => {
      const cachedImage = textureCache.getCachedImage(path)
      if (cachedImage) {
        return createTexture(cachedImage)
      }
      const img = await textureCache.loadImage(path)
      return createTexture(img)
    }

    const loadWithFallback = async (): Promise<void> => {
      if (!texturePath) {
        try {
          setIsLoading(true)
          const fallbackTexture = await loadTextureWithCache('/blank-waymo.png')
          setTexture(fallbackTexture)
        } catch (error) {
          console.warn('Failed to load default texture, using null')
          setTexture(null)
        } finally {
          setIsLoading(false)
        }
        return
      }

      if (texturePath.includes('firebasestorage.googleapis.com') && textureCache.isUrlBroken(texturePath)) {
        console.warn(`Skipping known broken Firebase URL: ${texturePath}`)
        try {
          setIsLoading(true)
          const defaultTexture = await loadTextureWithCache('/blank-waymo.png')
          setTexture(defaultTexture)
        } catch (defaultError) {
          console.warn('Default texture fallback failed', defaultError)
          setTexture(null)
        } finally {
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)

      try {
        // First check if texturePath itself is a data URL (published scenes store base64 directly)
        if (texturePath.startsWith('data:')) {
          const loader = new THREE.TextureLoader()
          await new Promise<void>((resolve, reject) => {
            loader.load(
              texturePath,
              (loadedTexture) => {
                loadedTexture.flipY = false
                loadedTexture.wrapS = THREE.RepeatWrapping
                loadedTexture.wrapT = THREE.RepeatWrapping
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter
                loadedTexture.magFilter = THREE.LinearFilter
                loadedTexture.generateMipmaps = true
                loadedTexture.anisotropy = 4
                loadedTexture.colorSpace = THREE.SRGBColorSpace
                setTexture(loadedTexture)
                resolve()
              },
              undefined,
              () => reject(new Error('Data URL texture load failed'))
            )
          })
          return
        }

        // Check if it's a generated texture ID with base64 data in the array
        const base64Texture = generatedTextures.find(t =>
          t.id === texturePath &&
          (texturePath.startsWith('uv_mock_') || texturePath.startsWith('ai_generated_') || texturePath.startsWith('uv_map_'))
        )

        if (base64Texture?.imageData?.startsWith('data:')) {
          const loader = new THREE.TextureLoader()
          await new Promise<void>((resolve, reject) => {
            loader.load(
              base64Texture.imageData!,
              (loadedTexture) => {
                loadedTexture.flipY = false
                loadedTexture.wrapS = THREE.RepeatWrapping
                loadedTexture.wrapT = THREE.RepeatWrapping
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter
                loadedTexture.magFilter = THREE.LinearFilter
                loadedTexture.generateMipmaps = true
                loadedTexture.anisotropy = 4
                loadedTexture.colorSpace = THREE.SRGBColorSpace
                setTexture(loadedTexture)
                resolve()
              },
              undefined,
              () => reject(new Error('Base64 texture load failed'))
            )
          })
        } else if (texturePath.startsWith('http')) {
          // Handle Firebase Storage URLs or other HTTP URLs
          const loadedTexture = await loadTextureWithCache(texturePath)
          setTexture(loadedTexture)
        } else {
          const normalizedPath = texturePath.startsWith('/') ? texturePath : `/${texturePath}`
          const loadedTexture = await loadTextureWithCache(normalizedPath)
          setTexture(loadedTexture)
        }
      } catch (error) {
        console.warn(`Failed to load texture: ${texturePath}`, error)
        try {
          const fallbackTexture = await loadTextureWithCache('/blank-waymo.png')
          setTexture(fallbackTexture)
        } catch (fallbackError) {
          console.warn('Fallback texture failed', fallbackError)
          setTexture(null)
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadWithFallback()
  }, [texturePath, generatedTextures])

  return { texture, isLoading }
}

// Preload models for faster loading
useGLTF.preload('/Waymo.glb');
useFBX.preload('/3D-guy.fbx');

// Camera Controller Component - updates camera position every frame for smooth control
function CameraController({ position, target }: { position: [number, number, number], target: [number, number, number] }) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3());
  const positionVec = useRef(new THREE.Vector3());

  // Update immediately when position/target props change
  useEffect(() => {
    console.log('🎥 CameraController: Position changed to', position);
    positionVec.current.set(...position);
    targetVec.current.set(...target);
  }, [position, target]);

  // Smoothly interpolate to target position every frame
  useFrame(() => {
    camera.position.lerp(positionVec.current, 0.1);
    camera.lookAt(targetVec.current);
  });

  return null;
}

interface SceneViewerProps {
  scene: {
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
    title?: string;
    description?: string;
  };
}

export default function SceneViewer({ scene }: SceneViewerProps) {
  const { sceneData } = scene;

  // Debug logging
  useEffect(() => {
    console.log('[SceneViewer] Full scene data:', scene);
    console.log('[SceneViewer] Scene texture:', sceneData.texture);
    console.log('[SceneViewer] Background color:', sceneData.backgroundColor);
    console.log('[SceneViewer] Background image:', sceneData.backgroundImage);
  }, [scene, sceneData]);

  const [isRotating, setIsRotating] = useState(sceneData.isRotating || false);
  const [showPerson, setShowPerson] = useState(sceneData.showPerson || false);
  const [currentCameraAngle, setCurrentCameraAngle] = useState(sceneData.cameraAngle || 'front');
  const [backgroundColor] = useState(sceneData.backgroundColor || '#1a1a1a'); // Default to dark
  const [backgroundImage] = useState<string | null>(sceneData.backgroundImage || null);
  const [showControls, setShowControls] = useState(false);
  const [isTextureLoading, setIsTextureLoading] = useState(false);
  const [skyboxPreset] = useState<string | null>(null);
  const [numberOfUnits, setNumberOfUnits] = useState(sceneData.numberOfUnits || 1);
  const [rotationSpeed, setRotationSpeed] = useState(sceneData.rotationSpeed || 0.5);
  const [scenePosition, setScenePosition] = useState(sceneData.scenePosition || { x: 0, y: 0, z: 0 });
  const [sceneRotation, setSceneRotation] = useState(sceneData.sceneRotation || { x: 0, y: 0, z: 0 });
  const [cameraRotation, setCameraRotation] = useState({ azimuth: 0, elevation: 0, distance: 5 });

  // Memoize camera presets to prevent recreation every render
  const cameraPresets: Record<string, { position: number[], target: number[], name: string }> = useMemo(() => ({
    front: { position: [0, 3, 22], target: [0, 0, 0], name: 'Front' },
    side: { position: [22, 3, 0], target: [0, 0, 0], name: 'Side' },
    back: { position: [0, 3, -22], target: [0, 0, 0], name: 'Back' },
    topFront: { position: [0, 12, 18], target: [0, 0, 0], name: 'Top Front' },
    lowAngle: { position: [0, 1, 18], target: [0, 1, 0], name: 'Low Angle' },
    threequarter: { position: [16, 6, 16], target: [0, 0, 0], name: '3/4 View' },
    custom: { position: [18, 15, 18], target: [0, 0, 0], name: 'Top 3/4' }
  }), []);

  // Memoize camera position to avoid recreating array every render
  const cameraPosition = useMemo(() => {
    if (sceneData.cameraPosition) {
      console.log('📷 Using saved camera position:', sceneData.cameraPosition);
      return [sceneData.cameraPosition.x, sceneData.cameraPosition.y, sceneData.cameraPosition.z];
    }

    if (currentCameraAngle === 'custom') {
      console.log('📷 Using custom mode - calculating from rotation');
      const { azimuth, elevation, distance } = cameraRotation;
      const target = [0, -0.5, 0];

      const x = distance * Math.cos(elevation) * Math.sin(azimuth);
      const y = target[1] + distance * Math.sin(elevation);
      const z = distance * Math.cos(elevation) * Math.cos(azimuth);

      console.log('📐 Calculated position:', {
        azimuth: (azimuth * 180 / Math.PI).toFixed(0) + '°',
        elevation: (elevation * 180 / Math.PI).toFixed(0) + '°',
        distance,
        result: [x.toFixed(2), y.toFixed(2), z.toFixed(2)]
      });

      return [x, y, z];
    }

    console.log('📷 Using preset:', currentCameraAngle);
    return cameraPresets[currentCameraAngle].position;
  }, [sceneData.cameraPosition, currentCameraAngle, cameraRotation.azimuth, cameraRotation.elevation, cameraRotation.distance, cameraPresets]);

  const cameraTarget = useMemo(() => {
    if (sceneData.cameraTarget) {
      return [sceneData.cameraTarget.x, sceneData.cameraTarget.y, sceneData.cameraTarget.z];
    }
    return cameraPresets[currentCameraAngle].target;
  }, [sceneData.cameraTarget, currentCameraAngle, cameraPresets]);

  const currentPreset = {
    position: cameraPosition,
    target: cameraTarget,
    name: cameraPresets[currentCameraAngle]?.name || 'Custom'
  };

  // Update camera rotation sliders when preset changes
  useEffect(() => {
    if (currentCameraAngle !== 'custom' && cameraPresets[currentCameraAngle]) {
      const preset = cameraPresets[currentCameraAngle];
      const position = preset.position;
      const target = preset.target;

      // Convert cartesian position to spherical coordinates
      const dx = position[0] - target[0];
      const dy = position[1] - target[1];
      const dz = position[2] - target[2];

      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const azimuth = Math.atan2(dx, dz);
      const elevation = Math.asin(dy / distance);

      setCameraRotation({
        azimuth,
        elevation,
        distance
      });
    }
  }, [currentCameraAngle]);

  const downloadSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `scene-snapshot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div
      className="w-full h-full relative"
      style={{
        backgroundColor: backgroundColor,
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
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
        shadows={sceneData.shadowsEnabled !== false}
        camera={{
          position: currentPreset.position as [number, number, number],
          fov: 45
        }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: true,
          stencil: false,
          depth: true,
          preserveDrawingBuffer: true
        }}
      >
        {/* Configurable lighting setup */}
        <ambientLight
          intensity={sceneData.ambientLightIntensity || 0.4}
          color={sceneData.ambientLightColor || "#ffeedd"}
        />
        <hemisphereLight
          intensity={sceneData.hemisphereIntensity || 0.6}
          color="#87CEEB"  // Sky blue
          groundColor="#8B7355"  // Earth brown
        />
        <directionalLight
          position={sceneData.directionalLightPosition ?
            [sceneData.directionalLightPosition.x, sceneData.directionalLightPosition.y, sceneData.directionalLightPosition.z] :
            [5, 15, 5]
          }
          intensity={sceneData.directionalLightIntensity || 1.8}
          color={sceneData.directionalLightColor || "#fffaf0"}
          castShadow={sceneData.shadowsEnabled !== false}
          shadow-mapSize={[sceneData.shadowQuality || 4096, sceneData.shadowQuality || 4096]}
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
          position={currentPreset.position as [number, number, number]}
          target={currentPreset.target as [number, number, number]}
        />

        <Suspense fallback={null}>
          <WaymoModel
            currentTexture={sceneData.texture}
            numberOfUnits={numberOfUnits}
            scenePosition={scenePosition}
            sceneRotation={sceneRotation}
            isRotating={isRotating}
            generatedTextures={[]}
            rotationSpeed={rotationSpeed}
            onLoadingChange={setIsTextureLoading}
          />

          {showPerson && <PersonModel />}

          {sceneData.showGroundPlane !== false && <GroundPlane />}

          {sceneData.shadowsEnabled !== false && (
            <ContactShadows
              position={[0, -1.19, 0]}
              opacity={0.6}
              scale={10}
              blur={1.2}
              far={5}
              resolution={1024}
              color="#000000"
            />
          )}

          {/* Only show Environment/HDRI when skyboxPreset is active */}
          {skyboxPreset ? (
            <Environment
              preset={skyboxPreset as 'sunset' | 'dawn' | 'night' | 'warehouse' | 'forest' | 'apartment' | 'studio' | 'city' | 'park' | 'lobby'}
              background={false}
              backgroundIntensity={sceneData.backgroundIntensity || 1.5}
              environmentIntensity={sceneData.environmentIntensity || 1.5}
              ground={{
                height: -1.2,
                radius: 25,
                scale: 80
              }}
            />
          ) : (
            <Environment
              preset="sunset"
              background={false}
              backgroundIntensity={0.3}
              environmentIntensity={0.3}
            />
          )}
        </Suspense>

{/* OrbitControls removed - using manual camera controls via sliders */}

        <Preload all />
      </Canvas>

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
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                Pause
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </>
            )}
          </button>

          <button
            onClick={() => setShowPerson(!showPerson)}
            className="px-3 py-1 bg-black/50 hover:bg-black/70 text-white rounded text-xs transition-colors flex items-center gap-1"
            title={showPerson ? "Hide person" : "Show person for scale"}
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
                        const newAzimuth = parseFloat(e.target.value);
                        console.log('🎚️ ORBIT SLIDER MOVED:', newAzimuth, 'degrees:', (newAzimuth * 180 / Math.PI).toFixed(0));
                        setCameraRotation(prev => {
                          console.log('🔄 Setting camera rotation:', { ...prev, azimuth: newAzimuth });
                          return { ...prev, azimuth: newAzimuth };
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
                      min="-1.57"
                      max="1.57"
                      step="0.05"
                      value={cameraRotation.elevation}
                      onChange={(e) => {
                        const newElevation = parseFloat(e.target.value);
                        console.log('🎚️ HEIGHT SLIDER MOVED:', newElevation, 'degrees:', (newElevation * 180 / Math.PI).toFixed(0));
                        setCameraRotation(prev => {
                          console.log('🔄 Setting camera rotation:', { ...prev, elevation: newElevation });
                          return { ...prev, elevation: newElevation };
                        });
                        setCurrentCameraAngle('custom');
                      }}
                      className="flex-1"
                    />
                    <span className="text-white text-xs w-10 text-right">{(cameraRotation.elevation * 180 / Math.PI).toFixed(0)}°</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-white text-xs w-16">Zoom:</label>
                    <input
                      type="range"
                      min="2"
                      max="10"
                      step="0.1"
                      value={cameraRotation.distance}
                      onChange={(e) => {
                        const newDistance = parseFloat(e.target.value);
                        console.log('🎚️ ZOOM SLIDER MOVED:', newDistance);
                        setCameraRotation(prev => ({ ...prev, distance: newDistance }));
                      }}
                      className="flex-1"
                    />
                    <span className="text-white text-xs w-10 text-right">{cameraRotation.distance.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Camera angle controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-black/80 backdrop-blur-md rounded-lg p-2 z-10">
        <div className="text-white text-sm font-semibold mb-1">Camera Angles</div>
        {Object.entries(cameraPresets).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => setCurrentCameraAngle(key)}
            className={`px-3 py-1.5 rounded text-sm transition-all ${
              currentCameraAngle === key
                ? 'bg-white text-black font-semibold'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            title={`${preset.name} view`}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}