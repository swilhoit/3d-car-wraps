import { useEffect, useState } from 'react';
import { textureCache } from '@/lib/cacheManager';

export function useTexturePreloader() {
  const [isPreloading, setIsPreloading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    const preloadTextures = async () => {
      // List of critical textures to preload
      const criticalTextures = [
        '/Coco Wrap.png',
        '/Coco Wrap Thumbnail.png',
        '/blank-template.png'
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

      // Additional textures to preload in background
      const additionalTextures = [
        '/chargers.jpg',
        '/littlecaesars.jpg',
        '/picnic.jpg',
        '/robosense.jpg',
        '/creator.jpg',
        '/venom.jpg',
        '/wolt.jpg',
        '/xpel.jpg',
        '/pickup.jpg',
        '/donjulio.jpg',
        '/electricstate.jpg'
      ];

      // Preload additional textures without blocking
      textureCache.preloadImages(additionalTextures).then(() => {
        setLoadedCount(prev => prev + additionalTextures.length);
      });

      setIsPreloading(false);
    };

    if (typeof window !== 'undefined') {
      preloadTextures();
    }
  }, []);

  return { isPreloading, loadedCount };
}