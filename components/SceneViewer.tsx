'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, useFBX, Preload } from '@react-three/drei';
import { Suspense, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

// Preload models for faster loading
useGLTF.preload('/CocoAdWrap.glb');
useGLTF.preload('/Chicago Bean.glb');
useFBX.preload('/3D-guy.fbx');

// Camera Controller Component
function CameraController({ position, target }: { position: [number, number, number], target: [number, number, number] }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.lerp(new THREE.Vector3(...position), 0.1);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, position, target]);

  useFrame(() => {
    camera.position.lerp(new THREE.Vector3(...position), 0.1);
    camera.lookAt(...target);
  });

  return null;
}

// Chicago Bean model component
function ChicagoBeanModel() {
  const { scene } = useGLTF('/Chicago Bean.glb');
  const clonedScene = useRef<THREE.Object3D>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (scene && !isLoaded) {
      clonedScene.current = scene.clone(true);
      setIsLoaded(true);

      // Scale and position the bean
      clonedScene.current.scale.setScalar(1.5);
      clonedScene.current.position.set(-30, -1.2, -8);

      // Apply chrome material
      clonedScene.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            const originalMaterial = mesh.material as THREE.MeshStandardMaterial;
            mesh.material = originalMaterial.clone();

            if (mesh.material instanceof THREE.MeshStandardMaterial) {
              mesh.material.metalness = 0.95;
              mesh.material.roughness = 0.05;
              mesh.material.envMapIntensity = 2;
              mesh.material.emissive = new THREE.Color('#333333');
              mesh.material.emissiveIntensity = 0.1;
              mesh.material.color = new THREE.Color('#e0e0e0');
            }
          }
        }
      });
    }
  }, [scene, isLoaded]);

  if (!isLoaded || !clonedScene.current) {
    return (
      <mesh position={[-30, 0, -8]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshBasicMaterial color="#333333" opacity={0.5} transparent />
      </mesh>
    );
  }

  return <primitive object={clonedScene.current} />;
}

// Person model component
function PersonModel() {
  const fbx = useFBX('/3D-guy.fbx');
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (fbx && groupRef.current) {
      const box = new THREE.Box3().setFromObject(fbx);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Scale to roughly 1.8m height (average human height)
      const desiredHeight = 1.8;
      const scaleFactor = desiredHeight / size.y;

      fbx.scale.setScalar(scaleFactor);
      fbx.position.x = -center.x * scaleFactor;
      fbx.position.y = -1.2; // Place on ground
      fbx.position.z = -center.z * scaleFactor + 2; // Position in front

      // Apply material
      fbx.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            const newMaterial = new THREE.MeshStandardMaterial({
              color: 0x444444,
              roughness: 0.8,
              metalness: 0.2,
            });
            mesh.material = newMaterial;
          }
        }
      });
    }
  }, [fbx]);

  if (!fbx) return null;

  return (
    <group ref={groupRef} position={[2, 0, 0]}>
      <primitive object={fbx} />
    </group>
  );
}

// Main model component for viewer
function ViewerModel({
  texture,
  numberOfUnits,
  scenePosition,
  sceneRotation,
  isRotating,
  rotationSpeed = 0.01
}: {
  texture: string | null;
  numberOfUnits: number;
  scenePosition: { x: number; y: number; z: number };
  sceneRotation: { x: number; y: number; z: number };
  isRotating: boolean;
  rotationSpeed?: number;
}) {
  const { scene } = useGLTF('/CocoAdWrap.glb');
  const groupRef = useRef<THREE.Group>(null);
  const [loadedTexture, setLoadedTexture] = useState<THREE.Texture | null>(null);

  // Load texture
  useEffect(() => {
    if (!texture) {
      // Load default Coco Wrap texture
      const loader = new THREE.TextureLoader();
      loader.load('/Coco Wrap.png', (tex) => {
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        setLoadedTexture(tex);
      });
      return;
    }

    const loader = new THREE.TextureLoader();
    if (texture.startsWith('http') || texture.startsWith('https')) {
      loader.crossOrigin = 'anonymous';
    }

    let textureUrl = texture;
    if (!texture.startsWith('http') && !texture.startsWith('https') && !texture.startsWith('data:')) {
      textureUrl = texture.startsWith('/') ? texture : `/${texture}`;
    }

    loader.load(
      textureUrl,
      (tex) => {
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        tex.colorSpace = THREE.SRGBColorSpace;
        setLoadedTexture(tex);
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error);
        // Load fallback
        const fallbackLoader = new THREE.TextureLoader();
        fallbackLoader.load('/Coco Wrap.png', (fallbackTex) => {
          fallbackTex.flipY = false;
          fallbackTex.wrapS = THREE.RepeatWrapping;
          fallbackTex.wrapT = THREE.RepeatWrapping;
          setLoadedTexture(fallbackTex);
        });
      }
    );
  }, [texture]);

  // Rotation animation
  useFrame(() => {
    if (groupRef.current && isRotating) {
      groupRef.current.rotation.y += rotationSpeed;
    }
  });

  // Calculate grid layout for multiple units
  const spacing = 4.0;
  const cols = Math.ceil(Math.sqrt(numberOfUnits));
  const rows = Math.ceil(numberOfUnits / cols);
  const positions: [number, number, number][] = [];

  for (let i = 0; i < numberOfUnits; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * spacing;
    const z = (row - (rows - 1) / 2) * spacing;
    positions.push([x, 0, z]);
  }

  if (!scene) return null;

  return (
    <group
      ref={groupRef}
      position={[scenePosition.x, scenePosition.y, scenePosition.z]}
      rotation={[sceneRotation.x, sceneRotation.y, sceneRotation.z]}
    >
      {positions.map(([x, y, z], index) => {
        const clonedScene = scene.clone();

        // Apply texture to each clone
        clonedScene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const material = child.material as THREE.Material;
            if (material && material.name === 'Coco Wrap' && loadedTexture) {
              child.material = new THREE.MeshStandardMaterial({
                map: loadedTexture,
                metalness: 0.0,
                roughness: 0.2,
                envMapIntensity: 1.5,
                color: new THREE.Color(1.0, 1.0, 1.0),
              });
              child.castShadow = true;
              child.receiveShadow = true;
            }
          }
        });

        return (
          <group
            key={index}
            position={[x, y - 1.2, z]}
            scale={[1, 1, 1]}
          >
            <primitive object={clonedScene} />
          </group>
        );
      })}
    </group>
  );
}

// Ground plane component
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color="#1a1a1a" roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

interface SceneViewerProps {
  scene: {
    sceneData: {
      texture: string | null;
      backgroundColor: string;
      backgroundImage: string | null;
      numberOfUnits: number;
      sceneRotation: { x: number; y: number; z: number };
      scenePosition: { x: number; y: number; z: number };
    };
    title?: string;
    description?: string;
  };
}

export default function SceneViewer({ scene }: SceneViewerProps) {
  const { sceneData } = scene;
  const [isRotating, setIsRotating] = useState(false);
  const [showPerson, setShowPerson] = useState(false);
  const [showCity, setShowCity] = useState(false);
  const [currentCameraAngle, setCurrentCameraAngle] = useState(0);

  const cameraPresets = [
    { position: [0, 2, 8], target: [0, 0, 0], name: 'Front' },
    { position: [8, 2, 0], target: [0, 0, 0], name: 'Side' },
    { position: [0, 8, 2], target: [0, 0, 0], name: 'Top' },
    { position: [5, 5, 5], target: [0, 0, 0], name: 'Angle' }
  ];

  const currentPreset = cameraPresets[currentCameraAngle];

  return (
    <div
      className="w-full h-full relative"
      style={{
        backgroundColor: sceneData.backgroundColor || '#111',
        backgroundImage: sceneData.backgroundImage ? `url(${sceneData.backgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <Canvas
        shadows
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
        {/* Natural sunlight setup */}
        <ambientLight intensity={0.4} color="#ffeedd" />
        <hemisphereLight
          intensity={0.6}
          color="#87CEEB"
          groundColor="#8B7355"
        />
        <directionalLight
          position={[5, 15, 5]}
          intensity={1.8}
          color="#fffaf0"
          castShadow
          shadow-mapSize={[4096, 4096]}
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
          color="#87CEEB"
        />

        {showCity && (
          <>
            <pointLight position={[-30, 5, -8]} intensity={2} color="#ffffff" />
            <pointLight position={[-30, 2, -5]} intensity={1.5} color="#ffffff" />
            <spotLight
              position={[-20, 10, 0]}
              intensity={2}
              angle={0.5}
              penumbra={0.3}
              target-position={[-30, 0, -8]}
              color="#ffffff"
            />
          </>
        )}

        <CameraController
          position={currentPreset.position as [number, number, number]}
          target={currentPreset.target as [number, number, number]}
        />

        <Suspense fallback={null}>
          <ViewerModel
            texture={sceneData.texture}
            numberOfUnits={sceneData.numberOfUnits || 1}
            scenePosition={sceneData.scenePosition || { x: 0, y: 0, z: 0 }}
            sceneRotation={sceneData.sceneRotation || { x: 0, y: 0, z: 0 }}
            isRotating={isRotating}
          />

          {showCity && <ChicagoBeanModel />}
          {showPerson && <PersonModel />}

          <GroundPlane />

          <Environment
            preset="sunset"
            background={false}
            environmentIntensity={0.8}
          />
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI - Math.PI / 6}
          enableDamping={true}
          dampingFactor={0.05}
          autoRotate={false}
        />

        <Preload all />
      </Canvas>

      {/* Control buttons */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 z-10">
        <button
          onClick={() => setIsRotating(!isRotating)}
          className={`px-3 py-1 ${isRotating ? 'bg-white text-black' : 'bg-black/50 hover:bg-black/70 text-white'} rounded text-xs transition-colors flex items-center gap-1`}
          title={isRotating ? "Stop rotation" : "Start rotation"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isRotating ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            )}
          </svg>
          {isRotating ? 'Pause' : 'Play'}
        </button>

        <button
          onClick={() => setShowPerson(!showPerson)}
          className={`px-3 py-1 ${showPerson ? 'bg-white text-black' : 'bg-black/50 hover:bg-black/70 text-white'} rounded text-xs transition-colors flex items-center gap-1`}
          title={showPerson ? "Hide person" : "Show person for size comparison"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {showPerson ? 'Hide' : 'Show'} Person
        </button>

        <button
          onClick={() => setShowCity(!showCity)}
          className={`px-3 py-1 ${showCity ? 'bg-white text-black' : 'bg-black/50 hover:bg-black/70 text-white'} rounded text-xs transition-colors flex items-center gap-1`}
          title={showCity ? "Hide city elements" : "Show city elements"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          {showCity ? 'Hide' : 'Show'} City
        </button>
      </div>

      {/* Camera angle controls */}
      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        {cameraPresets.map((preset, index) => (
          <button
            key={index}
            onClick={() => setCurrentCameraAngle(index)}
            className={`px-3 py-1 ${currentCameraAngle === index ? 'bg-white text-black' : 'bg-black/50 hover:bg-black/70 text-white'} rounded text-xs transition-colors`}
            title={`${preset.name} view`}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}