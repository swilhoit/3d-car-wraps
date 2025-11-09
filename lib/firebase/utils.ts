// Utility functions for Firebase operations

export const base64ToBlob = (base64: string, contentType = 'image/png'): Blob => {
  // Ensure base64 is a string and not null/undefined
  if (!base64 || typeof base64 !== 'string') {
    throw new Error(`base64ToBlob expects a non-empty string, got ${typeof base64}: ${base64}`);
  }

  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');

  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
};

export const dataURLToBlob = async (dataURL: string): Promise<Blob> => {
  const response = await fetch(dataURL);
  return response.blob();
};