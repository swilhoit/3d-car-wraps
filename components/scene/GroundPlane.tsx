'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

interface GroundPlaneProps {
  floorMode?: 'asphalt' | 'custom';
  floorColor?: string;
}

function GroundPlane({ floorMode = 'asphalt', floorColor = '#808080' }: GroundPlaneProps) {
  const diffuseMap = useTexture('/Gravel%20Texture/textures/gravel_concrete_02_diff_1k.jpg');
  const displacementMap = useTexture('/Gravel%20Texture/textures/gravel_concrete_02_disp_1k.png');
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Create radial gradient alpha map for edge fade
  const alphaMap = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY);

    // Create radial gradient from center (opaque) to edges (transparent)
    // Fade background more gradually for stronger depth of field effect
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'white');      // Fully opaque at center
    gradient.addColorStop(0.65, 'white');   // Stay opaque until 65% - more aggressive fade
    gradient.addColorStop(1, 'black');      // Fade to transparent at edges

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => {
    diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
    diffuseMap.repeat.set(10, 10);
    diffuseMap.anisotropy = 16;
    diffuseMap.needsUpdate = true;

    displacementMap.wrapS = displacementMap.wrapT = THREE.RepeatWrapping;
    displacementMap.repeat.set(10, 10);
    displacementMap.needsUpdate = true;
  }, [diffuseMap, displacementMap]);

  useEffect(() => {
    if (materialRef.current) {
      if (floorMode === 'asphalt') {
        // Enable asphalt textures
        materialRef.current.map = diffuseMap;
        materialRef.current.displacementMap = displacementMap;
        materialRef.current.displacementScale = 0.002;
        materialRef.current.roughness = 0.8;
        materialRef.current.metalness = 0.2;
        materialRef.current.color.set('#b5b5b5');
      } else {
        // Disable textures and use custom color
        materialRef.current.map = null;
        materialRef.current.displacementMap = null;
        materialRef.current.displacementScale = 0;
        materialRef.current.roughness = 0.9;
        materialRef.current.metalness = 0.1;
        materialRef.current.color.set(floorColor);
      }
      // Apply radial fade alpha map and enable transparency
      materialRef.current.alphaMap = alphaMap;
      materialRef.current.transparent = true;
      materialRef.current.needsUpdate = true;
    }
  }, [floorMode, floorColor, diffuseMap, displacementMap, alphaMap]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow castShadow>
      <planeGeometry args={[50, 50, 128, 128]} />
      <meshStandardMaterial
        ref={materialRef}
        map={floorMode === 'asphalt' ? diffuseMap : null}
        displacementMap={floorMode === 'asphalt' ? displacementMap : null}
        displacementScale={floorMode === 'asphalt' ? 0.002 : 0}
        roughness={floorMode === 'asphalt' ? 0.8 : 0.9}
        metalness={floorMode === 'asphalt' ? 0.2 : 0.1}
        envMapIntensity={0.8}
        color={floorMode === 'asphalt' ? '#b5b5b5' : floorColor}
        alphaMap={alphaMap}
        transparent={true}
      />
    </mesh>
  );
}

export default GroundPlane;
