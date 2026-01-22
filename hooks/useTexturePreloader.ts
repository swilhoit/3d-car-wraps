import { useEffect, useState } from 'react';
import { textureCache } from '@/lib/cacheManager';

export function useTexturePreloader() {
  const [isPreloading, setIsPreloading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    const preloadTextures = async () => {
      // List of critical textures to preload
      const criticalTextures = [
        '/blank-waymo.png',
        '/waymo-uv-template.png'
      ];

      // Preload critical textures first
      for (const texture of criticalTextures) {
        try {
          await textureCache.loadImage(texture);
          setLoadedCount(prev => prev + 1);
        } catch (err) {
          console.warn(`Failed to preload texture: ${texture}`);
        }
      }

      setIsPreloading(false);
    };

    if (typeof window !== 'undefined') {
      preloadTextures();
    }
  }, []);

  return { isPreloading, loadedCount };
}
