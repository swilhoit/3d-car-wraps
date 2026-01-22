'use client';

import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { textureCache } from '@/lib/cacheManager';

export function useProgressiveTexture(
  texturePath: string | null,
  generatedTextures: Array<{ id: string, name: string, thumbnail: string, isGenerated: true, imageData?: string }>,
  userTextures?: Array<{ id: string, name: string, url: string, thumbnailUrl?: string, metadata?: Record<string, unknown> }>
) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    console.log('🎨 useProgressiveTexture: Loading texture for path:', texturePath);

    const createTexture = (image: HTMLImageElement, lowQuality: boolean = false): THREE.Texture => {
      const newTexture = new THREE.Texture(image);
      newTexture.flipY = false;
      newTexture.wrapS = THREE.RepeatWrapping;
      newTexture.wrapT = THREE.RepeatWrapping;
      // Use lower quality filtering for faster initial load
      newTexture.minFilter = lowQuality ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      newTexture.magFilter = THREE.LinearFilter;
      newTexture.generateMipmaps = !lowQuality; // Skip mipmap generation for low quality
      newTexture.anisotropy = lowQuality ? 1 : 4; // Reduce anisotropy for faster load
      newTexture.colorSpace = THREE.SRGBColorSpace;
      newTexture.needsUpdate = true;
      return newTexture;
    };

    const loadTextureWithCache = async (path: string): Promise<THREE.Texture> => {
      const cachedImage = textureCache.getCachedImage(path);
      if (cachedImage) {
        return createTexture(cachedImage);
      }
      const img = await textureCache.loadImage(path);
      return createTexture(img);
    };

    const loadWithFallback = async (): Promise<void> => {
      if (!texturePath) {
        try {
          setIsLoading(true);
          const fallbackTexture = await loadTextureWithCache('/blank-waymo.png');
          setTexture(fallbackTexture);
        } catch (error) {
          console.warn('Failed to load default texture, using null');
          setTexture(null);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);

      try {
        // First check if texturePath itself is a data URL (published scenes store base64 directly)
        if (texturePath.startsWith('data:')) {
          console.log('📥 Loading texture from data URL');
          const loader = new THREE.TextureLoader();
          await new Promise<void>((resolve, reject) => {
            loader.load(
              texturePath,
              (loadedTexture) => {
                loadedTexture.flipY = false;
                loadedTexture.wrapS = THREE.RepeatWrapping;
                loadedTexture.wrapT = THREE.RepeatWrapping;
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
                loadedTexture.magFilter = THREE.LinearFilter;
                loadedTexture.generateMipmaps = true;
                loadedTexture.anisotropy = 4;
                loadedTexture.colorSpace = THREE.SRGBColorSpace;
                console.log('✅ Data URL texture loaded successfully');
                setTexture(loadedTexture);
                resolve();
              },
              undefined,
              () => reject(new Error('Data URL texture load failed'))
            );
          });
          return;
        }

        // Check if it's a generated texture ID with base64 data in the array
        const base64Texture = generatedTextures.find(t =>
          t.id === texturePath &&
          (texturePath.startsWith('uv_mock_') || texturePath.startsWith('ai_generated_') || texturePath.startsWith('uv_map_'))
        );

        if (base64Texture?.imageData?.startsWith('data:')) {
          const loader = new THREE.TextureLoader();
          await new Promise<void>((resolve, reject) => {
            loader.load(
              base64Texture.imageData!,
              (loadedTexture) => {
                loadedTexture.flipY = false;
                loadedTexture.wrapS = THREE.RepeatWrapping;
                loadedTexture.wrapT = THREE.RepeatWrapping;
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
                loadedTexture.magFilter = THREE.LinearFilter;
                loadedTexture.generateMipmaps = true;
                loadedTexture.anisotropy = 4;
                loadedTexture.colorSpace = THREE.SRGBColorSpace;
                setTexture(loadedTexture);
                resolve();
              },
              undefined,
              () => reject(new Error('Base64 texture load failed'))
            );
          });
        } else {
          // Check if this is a user texture ID - if so, get the Firebase URL
          let pathToLoad = texturePath;

          // Look up user texture by URL (Firebase storage URL passed as texturePath)
          const userTexture = userTextures?.find(t => t.url === texturePath);

          if (userTexture) {
            console.log('✅ Found user texture:', userTexture.name);
            pathToLoad = texturePath;
          } else if (!texturePath.startsWith('http')) {
            // For local file paths, ensure they start with /
            pathToLoad = texturePath.startsWith('/') ? texturePath : `/${texturePath}`;
          }

          console.log('📥 Loading texture from path:', pathToLoad.substring(0, 100));
          const loadedTexture = await loadTextureWithCache(pathToLoad);
          console.log('✅ Texture loaded successfully');
          setTexture(loadedTexture);
        }
      } catch (error) {
        console.warn(`Failed to load texture: ${texturePath}`, error);
        try {
          const fallbackTexture = await loadTextureWithCache('/blank-waymo.png');
          setTexture(fallbackTexture);
        } catch (fallbackError) {
          console.warn('Fallback texture failed', fallbackError);
          setTexture(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadWithFallback();
  }, [texturePath, generatedTextures, userTextures]);

  return { texture, isLoading };
}
