import React, { useEffect } from 'react';
import { textureCache, browserCache } from '../lib/cacheManager';

export const CacheCleaner: React.FC = () => {
  useEffect(() => {
    // Check if we need to clear cache on mount (e.g., after quota error)
    const checkAndClearCache = () => {
      try {
        // Try to write a test value
        localStorage.setItem('cache_test', 'test');
        localStorage.removeItem('cache_test');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.log('Detected quota exceeded, clearing all texture cache data...');
          browserCache.clear();
          textureCache.clearCache();
        }
      }
    };

    checkAndClearCache();
  }, []);

  return null;
};