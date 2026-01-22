import React from 'react';

interface UploadModeProps {
  onBack: () => void;
  uvUploadRef: React.RefObject<HTMLInputElement>;
  generationProgress: string;
}

const UploadMode: React.FC<UploadModeProps> = ({ onBack, uvUploadRef, generationProgress }) => {
  return (
    <div className="w-full h-screen flex items-center justify-center p-6 bg-black text-white">
      <div className="max-w-4xl w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Upload Custom UV</h2>
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
            ← Back to Options
          </button>
        </div>

        <div className="bg-gray-800 p-8 rounded-lg text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>

          <h3 className="text-xl font-bold mb-3">Upload Your UV Texture</h3>
          <p className="text-gray-400 mb-6">
            Select a pre-formatted UV texture map file (PNG, JPG, etc.)
          </p>

          <button
            onClick={() => uvUploadRef.current?.click()}
            className="bg-black hover:bg-gray-700 text-white font-bold py-3 px-8 rounded transition-colors border border-gray-600"
          >
            Choose UV File
          </button>

          <div className="mt-6 text-sm text-gray-500">
            <p>Supported formats: PNG, JPG, JPEG</p>
            <p>Recommended resolution: 1920x7671 (combined panels)</p>
          </div>
        </div>

        {generationProgress && (
          <div className="mt-6 p-4 bg-green-900 rounded text-center">
            {generationProgress}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadMode;
