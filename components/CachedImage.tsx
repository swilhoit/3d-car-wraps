import { useState, useEffect } from 'react';
import { textureCache } from '@/lib/cacheManager';

interface CachedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  onLoad?: () => void;
  priority?: boolean;
}

export default function CachedImage({
  src,
  alt,
  className = '',
  fallback = null,
  onLoad,
  priority = false
}: CachedImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadImage = async () => {
      try {
        // Check if already cached
        const cached = textureCache.getCachedImage(src);
        if (cached) {
          if (isMounted) {
            setImageUrl(cached.src);
            setIsLoading(false);
            onLoad?.();
          }
          return;
        }

        // Load with priority if specified
        if (priority) {
          const img = await textureCache.loadImage(src);
          if (isMounted) {
            setImageUrl(img.src);
            setIsLoading(false);
            onLoad?.();
          }
        } else {
          // Defer loading for non-priority images
          requestIdleCallback(async () => {
            try {
              const img = await textureCache.loadImage(src);
              if (isMounted) {
                setImageUrl(img.src);
                setIsLoading(false);
                onLoad?.();
              }
            } catch {
              if (isMounted) {
                setError(true);
                setIsLoading(false);
              }
            }
          });
        }
      } catch {
        if (isMounted) {
          setError(true);
          setIsLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
    };
  }, [src, onLoad, priority]);

  if (error && fallback) {
    return <>{fallback}</>;
  }

  if (isLoading) {
    return (
      <div className={`animate-pulse bg-gray-700 ${className}`} />
    );
  }

  return imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={alt}
      className={className}
    />
  ) : null;
}