'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import * as THREE from 'three';
import { useProgressiveTexture } from '@/hooks/useProgressiveTexture';

function WaymoModel({ currentTexture, isRotating, generatedTextures, userTextures, numberOfUnits, formation = 'grid', scatterSeed = 0, scenePosition, sceneRotation, rotationSpeed, flagColor, onLoadingChange }: {
  currentTexture: string | null,
  isRotating: boolean,
  generatedTextures: Array<{ id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string }>,
  userTextures?: Array<{ id: string, name: string, url: string, thumbnailUrl?: string, metadata?: Record<string, unknown> }>,
  numberOfUnits: number,
  formation?: 'grid' | 'line' | 'scatter',
  scatterSeed?: number,
  scenePosition: { x: number, y: number, z: number },
  sceneRotation: { x: number, y: number, z: number },
  rotationSpeed: number,
  flagColor?: string,
  onLoadingChange?: (loading: boolean) => void
}) {
  const groupRef = useRef<Group>(null!);
  const individualGroupRefs = useRef<(Group | null)[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { scene } = useGLTF('/Waymo.glb');
  const { texture, isLoading } = useProgressiveTexture(currentTexture, generatedTextures, userTextures);
  const rotationDirections = useRef<number[]>([]);

  // Debug: Log when currentTexture changes
  useEffect(() => {
    console.log('🔄 WaymoModel: currentTexture changed to:', currentTexture);
    console.log('📊 Texture loading status:', { isLoading, hasTexture: !!texture });
  }, [currentTexture, isLoading, texture]);

  // Notify parent of loading state changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(isLoading);
    }
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    rotationDirections.current = Array.from({ length: numberOfUnits }, () =>
      numberOfUnits > 1 ? (Math.random() > 0.5 ? 1 : -1) : 1
    );
  }, [numberOfUnits]);

  const originalMaterials = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const originalColors = useRef<Map<THREE.Mesh, THREE.Color>>(new Map());

  useEffect(() => {
    console.log('🎬 Material application effect running', { hasTexture: !!texture, sceneExists: !!scene });

    if (scene) {
      let fullWrapCount = 0;
      let appliedCount = 0;
      const allMaterialNames = new Set<string>();

      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.Material;

          // Collect all material names for debugging
          if (material.name) {
            allMaterialNames.add(material.name);
          }

          // Store original materials and colors on first pass
          if (!originalMaterials.current.has(child)) {
            originalMaterials.current.set(child, child.material);

            // Store original color if material has color property
            if ('color' in material && material.color instanceof THREE.Color) {
              originalColors.current.set(child, material.color.clone());
            }
          }

          if (child.geometry && !child.geometry.boundingSphere) {
            child.geometry.computeBoundingSphere();
            child.frustumCulled = true;
          }

          // Enable shadows for all mesh parts
          child.castShadow = true;
          child.receiveShadow = true;

          const isExcludedPart = (
            (child.name && (
              child.name.toLowerCase().includes('wheel') ||
              child.name.toLowerCase().includes('tire') ||
              child.name.includes('Flag')
            )) ||
            (material.name && (
              material.name.toLowerCase().includes('wheel') ||
              material.name.toLowerCase().includes('tire') ||
              material.name === 'Flag'
            ))
          );

          // ONLY apply texture to "Full Wrap" material - nothing else!
          const isWrappableMaterial = !isExcludedPart && material && (
            material.name === 'Full Wrap'
          );

          if (material.name === 'Full Wrap') {
            fullWrapCount++;
          }

          if (isWrappableMaterial) {
            if (texture && child.geometry && child.geometry.attributes.uv) {
              appliedCount++;
              console.log('✅ Applying texture to:', child.name || 'unnamed', 'material:', material.name);
              // Get the original color for this mesh
              const originalColor = originalColors.current.get(child) || new THREE.Color(1.0, 1.0, 1.0);

              // Dispose of old material if it exists
              if (child.material && child.material !== originalMaterials.current.get(child)) {
                (child.material as THREE.Material).dispose();
              }

              const texturedMaterial = new THREE.MeshStandardMaterial({
                map: texture,
                metalness: 0.0,
                roughness: 0.95,
                color: originalColor,
                side: THREE.DoubleSide,
                transparent: false,
                opacity: 1.0,
                alphaTest: 0.0,
                envMapIntensity: 0.1,
                emissive: new THREE.Color(0, 0, 0),
                emissiveIntensity: 0,
              });

              // CRITICAL: Preserve the material name so future texture changes can find it!
              texturedMaterial.name = 'Full Wrap';

              child.material = texturedMaterial;
              child.material.needsUpdate = true;
              texture.needsUpdate = true;
            } else if (!texture) {
              // Restore original material if no texture
              const originalMaterial = originalMaterials.current.get(child);
              if (originalMaterial && child.material !== originalMaterial) {
                if (child.material !== originalMaterial) {
                  (child.material as THREE.Material).dispose();
                }
                child.material = originalMaterial;
                child.material.needsUpdate = true;
              }
            }
          }
        }
      });

      console.log('📊 Material scan complete:', { fullWrapCount, appliedCount, hasTexture: !!texture });
      console.log('🎨 All material names found:', Array.from(allMaterialNames));
    }
  }, [scene, texture]);

  // Apply flag color to Flag material
  useEffect(() => {
    if (scene && flagColor) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.Material;

          // Check if this is the Flag material
          const isFlagMaterial = (
            (child.name && child.name.includes('Flag')) ||
            (material.name && material.name === 'Flag')
          );

          if (isFlagMaterial && 'color' in material) {
            // Apply the flag color
            (material as THREE.MeshStandardMaterial).color.set(flagColor);
            material.needsUpdate = true;
            console.log('🚩 Applied flag color:', flagColor, 'to', child.name || 'unnamed');
          }
        }
      });
    }
  }, [scene, flagColor]);

  useFrame((state, delta) => {
    if (!isDragging && isRotating) {
      individualGroupRefs.current.forEach((ref, index) => {
        if (ref) {
          const direction = rotationDirections.current[index] || 1;
          ref.rotation.y += delta * rotationSpeed * 30 * direction;
        }
      });
    }
  });

  // Generate all positions at once to handle collision detection for scatter
  const allPositions = React.useMemo(() => {
    const spacing = 6; // Larger spacing for bigger Waymo model
    const minDistance = 7; // Minimum distance between units in scatter mode
    const positions: Array<{ x: number, z: number, rotation: number }> = [];

    for (let index = 0; index < numberOfUnits; index++) {
      switch (formation) {
        case 'line': {
          // Arrange in a horizontal line
          const totalWidth = (numberOfUnits - 1) * spacing;
          const x = index * spacing - totalWidth / 2;
          positions.push({ x, z: 0, rotation: 0 });
          break;
        }

        case 'scatter': {
          // Random scatter with collision detection
          const spreadRadius = Math.max(10, Math.sqrt(numberOfUnits) * 5);
          let x = 0, z = 0, rotation = 0;
          let attempts = 0;
          const maxAttempts = 100;

          // Keep trying until we find a valid position that doesn't overlap
          do {
            const seed = (index * 12345) + (scatterSeed * 67890) + (attempts * 111);
            const random1 = Math.abs((Math.sin(seed) * 10000) % 1);
            const random2 = Math.abs((Math.cos(seed) * 10000) % 1);
            const random3 = Math.abs((Math.sin(seed * 2) * 10000) % 1);

            x = (random1 - 0.5) * spreadRadius * 2;
            z = (random2 - 0.5) * spreadRadius * 2;
            rotation = random3 * Math.PI * 2;

            // Check if this position is far enough from all existing positions
            const isTooClose = positions.some(pos => {
              const distance = Math.sqrt(Math.pow(pos.x - x, 2) + Math.pow(pos.z - z, 2));
              return distance < minDistance;
            });

            if (!isTooClose || attempts >= maxAttempts) {
              break;
            }

            attempts++;
          } while (attempts < maxAttempts);

          positions.push({ x, z, rotation });
          break;
        }

        case 'grid':
        default: {
          // Default grid formation
          const cols = Math.ceil(Math.sqrt(numberOfUnits));
          const rows = Math.ceil(numberOfUnits / cols);
          const col = index % cols;
          const row = Math.floor(index / cols);
          const offsetX = ((cols - 1) * spacing) / 2;
          const offsetZ = ((rows - 1) * spacing) / 2;
          const x = col * spacing - offsetX;
          const z = row * spacing - offsetZ;
          positions.push({ x, z, rotation: 0 });
          break;
        }
      }
    }

    return positions;
  }, [numberOfUnits, formation, scatterSeed]);

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
        const { x, z, rotation } = allPositions[index];

        return (
          <group
            key={index}
            ref={(el) => { individualGroupRefs.current[index] = el }}
            position={[x, 0, z]}
            rotation={[0, rotation, 0]}
            scale={[1, 1, 1]}
          >
            <primitive object={scene.clone()} />
          </group>
        );
      })}
      {isLoading && (
        <mesh position={[0, 3, 0]}>
          <boxGeometry args={[0.5, 0.1, 0.5]} />
          <meshBasicMaterial color="blue" />
        </mesh>
      )}
    </group>
  );
}

export default WaymoModel;
