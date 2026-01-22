'use client';

import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { textureCache } from '@/lib/cacheManager';

function BackgroundSphere({ image }: { image: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!image) {
      setTexture(null);
      return;
    }

    const loadBackground = async () => {
      try {
        const cachedImage = textureCache.getCachedImage(image);

        if (cachedImage) {
          const cachedTexture = new THREE.Texture(cachedImage);
          cachedTexture.mapping = THREE.EquirectangularReflectionMapping;
          cachedTexture.colorSpace = THREE.SRGBColorSpace;
          cachedTexture.needsUpdate = true;
          setTexture(cachedTexture);
        } else {
          const img = await textureCache.loadImage(image);
          const newTexture = new THREE.Texture(img);
          newTexture.mapping = THREE.EquirectangularReflectionMapping;
          newTexture.colorSpace = THREE.SRGBColorSpace;
          newTexture.needsUpdate = true;
          setTexture(newTexture);
        }
      } catch (error) {
        console.warn('Failed to load background image:', image, error);
        setTexture(null);
      }
    };

    loadBackground();
  }, [image]);

  if (!texture) return null;

  return (
    <mesh scale={[-50, 50, 50]} position={[0, -1.2, 0]} rotation={[0, 0, 0]}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

export default BackgroundSphere;
