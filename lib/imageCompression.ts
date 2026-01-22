/**
 * Compress an image to reduce file size
 * @param dataUrl - The data URL of the image to compress
 * @param maxSizeMB - Maximum size in megabytes (default 2MB)
 * @param maxWidthOrHeight - Maximum width or height (default 2048px)
 * @returns Promise with compressed data URL
 */
export async function compressImage(
  dataUrl: string,
  maxSizeMB: number = 2,
  maxWidthOrHeight: number = 2048
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Calculate new dimensions
      let width = img.width;
      let height = img.height;

      // Scale down if needed
      if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
        if (width > height) {
          height = (height * maxWidthOrHeight) / width;
          width = maxWidthOrHeight;
        } else {
          width = (width * maxWidthOrHeight) / height;
          height = maxWidthOrHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels to get under size limit
      let quality = 0.9;
      let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

      // Estimate size in bytes (rough estimate: base64 is ~1.37x larger than binary)
      let estimatedSize = (compressedDataUrl.length * 0.75) / (1024 * 1024); // Convert to MB

      while (estimatedSize > maxSizeMB && quality > 0.1) {
        quality -= 0.1;
        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        estimatedSize = (compressedDataUrl.length * 0.75) / (1024 * 1024);
      }

      console.log(`Image compressed: ${(img.width * img.height / 1000000).toFixed(2)}MP -> ${(width * height / 1000000).toFixed(2)}MP, ~${estimatedSize.toFixed(2)}MB, quality: ${quality.toFixed(1)}`);

      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for compression'));
    };

    img.src = dataUrl;
  });
}

/**
 * Convert a File or Blob to data URL
 */
export function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to data URL'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Check if a data URL exceeds size limit
 */
export function isDataUrlTooLarge(dataUrl: string, maxSizeMB: number = 10): boolean {
  const estimatedSizeMB = (dataUrl.length * 0.75) / (1024 * 1024);
  return estimatedSizeMB > maxSizeMB;
}