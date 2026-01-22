import React from 'react';
import Image from 'next/image';

interface StartWithLogoModeProps {
  onBack: () => void;
  onContinue: () => void;
  globalLogo: string | null;
  uploadGlobalLogo: (event: React.ChangeEvent<HTMLInputElement>) => void;
  globalLogoInputRef: React.RefObject<HTMLInputElement>;
  globalBackgroundType: 'color' | 'image';
  setGlobalBackgroundType: (type: 'color' | 'image') => void;
  globalBackgroundColor: string;
  handleGlobalBackgroundColorChange: (color: string) => void;
  globalBackgroundImage: string | null;
  uploadGlobalBackground: (event: React.ChangeEvent<HTMLInputElement>) => void;
  globalBackgroundInputRef: React.RefObject<HTMLInputElement>;
  generationProgress: string;
}

const StartWithLogoMode: React.FC<StartWithLogoModeProps> = ({
  onBack,
  onContinue,
  globalLogo,
  uploadGlobalLogo,
  globalLogoInputRef,
  globalBackgroundType,
  setGlobalBackgroundType,
  globalBackgroundColor,
  handleGlobalBackgroundColorChange,
  globalBackgroundImage,
  uploadGlobalBackground,
  globalBackgroundInputRef,
  generationProgress,
}) => {
  return (
    <div className="w-full h-screen overflow-y-auto p-6 bg-black text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Start with Logo</h2>
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
            ← Back to Options
          </button>
        </div>

        <div className="bg-gray-800 p-8 rounded-lg text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>

          <h3 className="text-xl font-bold mb-6">Upload Your Logo & Set Background</h3>

          {/* Logo Section */}
          <div className="mb-8">
            <h4 className="text-lg font-medium mb-3">1. Upload Logo</h4>
            <p className="text-gray-400 text-sm mb-4">
              Select your logo and it will be placed in the center of all 6 panels
            </p>
            {globalLogo ? (
              <div className="mb-4">
                <div className="w-32 h-32 mx-auto mb-3 bg-gray-700 rounded-lg border-2 border-green-500 p-2">
                  <Image src={globalLogo} alt="Selected logo" width={120} height={120} className="object-contain w-full h-full" />
                </div>
                <p className="text-green-400 text-sm">✓ Logo uploaded</p>
              </div>
            ) : (
              <button
                onClick={() => globalLogoInputRef.current?.click()}
                className="bg-black hover:bg-gray-700 text-white font-bold py-3 px-8 rounded transition-colors mb-4 border border-gray-600"
              >
                Choose Logo File
              </button>
            )}
          </div>

          {/* Background Section */}
          <div className="mb-8">
            <h4 className="text-lg font-medium mb-3">2. Set Global Background</h4>
            <p className="text-gray-400 text-sm mb-4">Choose a background color or image for all panels</p>
            <div className="flex gap-4 justify-center mb-6">
              <button
                onClick={() => setGlobalBackgroundType('color')}
                className={`px-4 py-2 rounded transition-colors ${
                  globalBackgroundType === 'color' ? 'bg-gray-900 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                Solid Color
              </button>
              <button
                onClick={() => setGlobalBackgroundType('image')}
                className={`px-4 py-2 rounded transition-colors ${
                  globalBackgroundType === 'image' ? 'bg-gray-900 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                Background Image
              </button>
            </div>
            {globalBackgroundType === 'color' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-4">
                  <label className="text-sm text-gray-300">Color:</label>
                  <input
                    type="color"
                    value={globalBackgroundColor}
                    onChange={(e) => handleGlobalBackgroundColorChange(e.target.value)}
                    className="w-16 h-10 rounded border border-gray-600"
                  />
                  <span className="text-sm text-gray-400">{globalBackgroundColor}</span>
                </div>
                <div className="text-xs text-gray-400 text-center">Color automatically applied to all panels</div>
              </div>
            ) : (
              <div className="space-y-4">
                {globalBackgroundImage && (
                  <div className="mb-4">
                    <div className="w-32 h-20 mx-auto mb-3 bg-gray-700 rounded-lg border-2 border-gray-600 p-1">
                      <Image src={globalBackgroundImage} alt="Selected background" width={120} height={72} className="object-cover w-full h-full rounded" />
                    </div>
                    <p className="text-gray-300 text-sm">✓ Background image selected</p>
                  </div>
                )}
                <button
                  onClick={() => globalBackgroundInputRef.current?.click()}
                  className="bg-gray-900 hover:bg-gray-800 text-white font-medium py-2 px-6 rounded transition-colors"
                >
                  {globalBackgroundImage ? 'Change Background Image' : 'Choose Background Image'}
                </button>
              </div>
            )}
          </div>

          {/* Continue Button */}
          {globalLogo && (
            <div className="mt-8">
              <button
                onClick={onContinue}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded transition-colors"
              >
                Continue to Panel Editor
              </button>
              <p className="text-gray-400 text-sm mt-3">
                You can adjust individual panels and their logos in the editor
              </p>
            </div>
          )}

          <div className="mt-6 text-sm text-gray-500">
            <p>Supported formats: PNG, JPG, JPEG, SVG</p>
            <p>Transparent backgrounds recommended for best results</p>
          </div>
        </div>

        {generationProgress && (
          <div className="mt-6 p-4 bg-green-900 rounded text-center">
            {generationProgress}
          </div>
        )}
      </div>
      <input
        ref={globalLogoInputRef}
        type="file"
        accept="image/*"
        onChange={uploadGlobalLogo}
        className="hidden"
      />
      <input
        ref={globalBackgroundInputRef}
        type="file"
        accept="image/*"
        onChange={uploadGlobalBackground}
        className="hidden"
      />
    </div>
  );
};

export default StartWithLogoMode;
