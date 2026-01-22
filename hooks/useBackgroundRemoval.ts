import { useState } from 'react';

interface UseBackgroundRemovalResult {
  isRemovingBackground: boolean;
  backgroundRemovalProgress: string;
  removeBackgroundFromImage: (imageUrl: string) => Promise<string | null>;
}

export function useBackgroundRemoval(): UseBackgroundRemovalResult {
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [backgroundRemovalProgress, setBackgroundRemovalProgress] = useState('');

  const removeBackgroundFromImage = async (imageUrl: string): Promise<string | null> => {
    if (!imageUrl) return null;

    setIsRemovingBackground(true);
    setBackgroundRemovalProgress('Loading AI model...');

    try {
      // Dynamically import the background removal library
      const { removeBackground } = await import('@imgly/background-removal');

      // Convert base64/url to Blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      setBackgroundRemovalProgress('Removing background...');

      // Remove background - using high quality model with best settings
      const result = await removeBackground(blob, {
        debug: true,
        model: 'isnet_fp16', // Use higher quality FP16 model
        output: {
          format: 'image/png',
          quality: 1.0, // Maximum quality
        },
        progress: (key: string, current: number, total: number) => {
          console.log('Background removal progress:', key, current, total);
          const percentage = Math.round((current / total) * 100);
          setBackgroundRemovalProgress(`Processing... ${percentage}%`);
        }
      });

      // Convert result blob to base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          setBackgroundRemovalProgress('Background removed successfully!');
          
          setTimeout(() => {
            setBackgroundRemovalProgress('');
            setIsRemovingBackground(false);
          }, 2000);
          
          resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(result);
      });

    } catch (error) {
      console.error('Background removal error:', error);
      setBackgroundRemovalProgress('Failed to remove background. Please try again.');
      setTimeout(() => {
        setBackgroundRemovalProgress('');
        setIsRemovingBackground(false);
      }, 3000);
      return null;
    }
  };

  return {
    isRemovingBackground,
    backgroundRemovalProgress,
    removeBackgroundFromImage
  };
}

