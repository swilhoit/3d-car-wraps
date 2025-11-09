'use client'

import { useRef, Suspense, useState, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { Group, Mesh, MeshStandardMaterial, CanvasTexture } from 'three'
import { useProgress, Html, Preload } from '@react-three/drei'

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center p-4 bg-black/80 rounded-lg">
        <div className="text-white mb-2">Loading 3D Model</div>
        <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-white text-sm mt-2">{Math.round(progress)}%</div>
      </div>
    </Html>
  )
}

interface OptimizedChromeModelProps {
  modelPath: string
  textures: string[]
  wireframe?: boolean
  scale?: number
  rotation?: [number, number, number]
  position?: [number, number, number]
}

function Model({ modelPath, textures, wireframe = false, scale = 1, rotation = [0, 0, 0], position = [0, 0, 0] }: OptimizedChromeModelProps) {
  const groupRef = useRef<Group>(null)
  const [textureIndex, setTextureIndex] = useState(0)
  const [loadedTextures, setLoadedTextures] = useState<Set<number>>(new Set())
  const [textureCache, setTextureCache] = useState<Map<number, HTMLImageElement>>(new Map())

  // Setup Draco loader for compressed models
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
  
  const gltfLoader = new GLTFLoader()
  gltfLoader.setDRACOLoader(dracoLoader)
  
  const gltf = useLoader(GLTFLoader, modelPath, (loader) => {
    loader.setDRACOLoader(dracoLoader)
  })

  // Preload textures progressively
  useEffect(() => {
    const preloadTextures = async () => {
      // Load current and next texture
      const indicesToLoad = [
        textureIndex,
        (textureIndex + 1) % textures.length,
        (textureIndex - 1 + textures.length) % textures.length
      ]

      for (const idx of indicesToLoad) {
        if (!loadedTextures.has(idx) && !textureCache.has(idx)) {
          const img = new Image()
          img.src = `/optimized/${textures[idx].replace('.jpg', '-large.webp')}`
          
          // Fallback to JPEG if WebP not supported
          img.onerror = () => {
            img.src = `/optimized/${textures[idx].replace('.jpg', '-large.jpg')}`
          }
          
          img.onload = () => {
            setTextureCache(prev => new Map(prev).set(idx, img))
            setLoadedTextures(prev => new Set(prev).add(idx))
          }
        }
      }
    }

    preloadTextures()
  }, [textureIndex, textures, loadedTextures, textureCache])

  // Apply optimized texture
  useEffect(() => {
    if (gltf && gltf.scene) {
      const textureImage = textureCache.get(textureIndex)
      if (textureImage) {
        gltf.scene.traverse((child) => {
          if ((child as Mesh).isMesh) {
            const mesh = child as Mesh
            const material = mesh.material as MeshStandardMaterial
            
            // Create canvas for texture
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (ctx) {
              canvas.width = textureImage.width
              canvas.height = textureImage.height
              ctx.drawImage(textureImage, 0, 0)
              
              // Apply texture
              const newMaterial = material.clone()
              newMaterial.map = new CanvasTexture(canvas)
              newMaterial.needsUpdate = true
              newMaterial.wireframe = wireframe
              mesh.material = newMaterial
            }
          }
        })
      }
    }
  }, [gltf, textureIndex, wireframe, textureCache])

  // Handle texture cycling
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setTextureIndex((prev) => (prev - 1 + textures.length) % textures.length)
      } else if (e.key === 'ArrowRight') {
        setTextureIndex((prev) => (prev + 1) % textures.length)
      }
    }

    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [textures.length])

  // Animation
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1
    }
  })

  return (
    <group ref={groupRef} scale={scale} rotation={rotation} position={position}>
      <primitive object={gltf.scene} />
    </group>
  )
}

export default function OptimizedChromeModel(props: OptimizedChromeModelProps) {
  return (
    <Suspense fallback={<Loader />}>
      <Model {...props} />
      <Preload all />
    </Suspense>
  )
}