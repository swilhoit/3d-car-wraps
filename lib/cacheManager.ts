class TextureCacheManager {
  private static instance: TextureCacheManager;
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private loadingPromises: Map<string, Promise<HTMLImageElement>> = new Map();
  private preloadQueue: Set<string> = new Set();

  private constructor() {
    // Initialize with preset textures that should be preloaded
    this.initializePresets();
  }

  static getInstance(): TextureCacheManager {
    if (!TextureCacheManager.instance) {
      TextureCacheManager.instance = new TextureCacheManager();
    }
    return TextureCacheManager.instance;
  }

  private initializePresets(): void {
    // Preset textures to preload - only existing files
    const presets = [
      '/Coco Wrap Thumbnail.png',
      '/Coco Wrap.png',
      '/blank-template.png',
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

    presets.forEach(url => {
      this.preloadQueue.add(url);
    });

    // Start preloading in background
    if (typeof window !== 'undefined') {
      requestIdleCallback(() => this.processPreloadQueue());
    }
  }

  private async processPreloadQueue(): Promise<void> {
    for (const url of this.preloadQueue) {
      try {
        await this.loadImage(url);
      } catch {
        console.warn(`Failed to preload ${url}, skipping...`);
      }
      this.preloadQueue.delete(url);
      // Small delay to avoid blocking
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async loadImage(url: string): Promise<HTMLImageElement> {
    // Return cached image if available
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url)!;
    }

    // Return existing loading promise if image is being loaded
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)!;
    }

    // Create loading promise
    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      // Enable CORS for cross-origin images
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.imageCache.set(url, img);
        this.loadingPromises.delete(url);
        resolve(img);
      };

      img.onerror = () => {
        this.loadingPromises.delete(url);
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });

    this.loadingPromises.set(url, loadPromise);
    return loadPromise;
  }

  getCachedImage(url: string): HTMLImageElement | null {
    return this.imageCache.get(url) || null;
  }

  isImageCached(url: string): boolean {
    return this.imageCache.has(url);
  }

  isImageLoading(url: string): boolean {
    return this.loadingPromises.has(url);
  }

  clearCache(): void {
    this.imageCache.clear();
    this.loadingPromises.clear();
  }

  getCacheSize(): number {
    return this.imageCache.size;
  }

  async preloadImages(urls: string[]): Promise<void> {
    await Promise.all(urls.map(url => this.loadImage(url).catch(() => undefined)));
  }
}

// Export singleton instance
export const textureCache = TextureCacheManager.getInstance();

// Browser cache utilities
export const browserCache = {
  // Store in localStorage with expiry
  set(key: string, value: unknown, expiryHours: number = 24): void {
    if (typeof window === 'undefined') return;

    const item = {
      value,
      expiry: Date.now() + (expiryHours * 60 * 60 * 1000)
    };

    try {
      localStorage.setItem(`texture_cache_${key}`, JSON.stringify(item));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  },

  get(key: string): unknown {
    if (typeof window === 'undefined') return null;

    try {
      const itemStr = localStorage.getItem(`texture_cache_${key}`);
      if (!itemStr) return null;

      const item = JSON.parse(itemStr);

      // Check if expired
      if (Date.now() > item.expiry) {
        localStorage.removeItem(`texture_cache_${key}`);
        return null;
      }

      return item.value;
    } catch (e) {
      console.warn('Failed to read from localStorage:', e);
      return null;
    }
  },

  clear(): void {
    if (typeof window === 'undefined') return;

    // Clear only texture cache items
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('texture_cache_')) {
        localStorage.removeItem(key);
      }
    });
  }
};