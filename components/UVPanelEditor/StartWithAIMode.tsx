import React, { useState } from 'react';
import Image from 'next/image';
import { useBackgroundRemoval } from '@/hooks/useBackgroundRemoval';

interface StartWithAIModeProps {
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
  globalPrompt: string;
  setGlobalPrompt: (prompt: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  referenceImage: string | null;
  uploadReferenceImage: (event: React.ChangeEvent<HTMLInputElement>) => void;
  referenceImageInputRef: React.RefObject<HTMLInputElement>;
  clearReferenceImage: () => void;
  isGenerating: boolean;
  generationProgress: string;
  flagColor?: string;
  onFlagColorChange?: (color: string) => void;
}

const StartWithAIMode: React.FC<StartWithAIModeProps> = ({
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
  globalPrompt,
  setGlobalPrompt,
  selectedModel,
  setSelectedModel,
  referenceImage,
  uploadReferenceImage,
  referenceImageInputRef,
  clearReferenceImage,
  isGenerating,
  generationProgress,
  flagColor,
  onFlagColorChange,
}) => {
  const { isRemovingBackground, backgroundRemovalProgress, removeBackgroundFromImage } = useBackgroundRemoval();

  const canContinue = globalPrompt.trim() || globalLogo || globalBackgroundImage || referenceImage;

  // Remove background from logo
  const handleRemoveBackground = async () => {
    if (!globalLogo) return;

    const base64data = await removeBackgroundFromImage(globalLogo);

    if (base64data) {
      // Convert base64 to Blob to create a File object
      const res = await fetch(base64data);
      const blob = await res.blob();
      
      // Update the logo with transparent version
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([blob], 'logo-transparent.png', { type: 'image/png' }));

      // Create a mock file input change event
      const mockEvent = {
        target: {
          files: dataTransfer.files,
          value: ''
        }
      } as React.ChangeEvent<HTMLInputElement>;

      uploadGlobalLogo(mockEvent);
    }
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-6 bg-black text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Start Your Design</h2>
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
            ← Back to Options
          </button>
        </div>

        <div className="bg-gray-800 p-8 rounded-lg space-y-8">
          {/* AI Prompt Section */}
          <div>
            <h3 className="text-xl font-bold mb-3 flex items-center">
              <svg className="w-6 h-6 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              1. AI Generation (Optional)
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Describe your design and let AI generate the panels
            </p>

            <textarea
              value={globalPrompt}
              onChange={(e) => setGlobalPrompt(e.target.value)}
              placeholder="e.g., 'A vibrant tropical beach scene with palm trees and sunset colors'"
              className="w-full bg-gray-700 border border-gray-600 text-white rounded px-4 py-3 h-24 resize-none mb-4 focus:border-purple-500 focus:outline-none transition-colors"
            />

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-300">AI Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 focus:border-purple-500 focus:outline-none transition-colors"
              >
                <option value="nano-banana">nano banana pro (default)</option>
                <option value="flux-kontext">Flux Kontext MULTI-IMAGE MAX</option>
                <option value="openai-image">OPEN AI IMAGE</option>
              </select>
            </div>

            {/* Reference Image Upload */}
            <div className="bg-gray-700 p-4 rounded-lg border border-gray-600">
              <h4 className="text-sm font-medium mb-2 text-gray-300">Reference Image (Optional)</h4>
              <p className="text-xs text-gray-400 mb-3">
                Upload an image to guide the AI generation style
              </p>

              {referenceImage ? (
                <div className="mb-3">
                  <div className="relative w-full h-40 bg-gray-800 rounded-lg border-2 border-green-500 p-2">
                    <Image
                      src={referenceImage}
                      alt="Reference"
                      fill
                      className="object-contain rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-green-400 text-xs">✓ Reference image uploaded</p>
                    <button
                      onClick={clearReferenceImage}
                      className="text-red-400 hover:text-red-300 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => referenceImageInputRef.current?.click()}
                  className="w-full bg-gray-600 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded transition-colors flex items-center justify-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Add Reference Image
                </button>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700"></div>

          {/* Logo Section */}
          <div>
            <h3 className="text-xl font-bold mb-3 flex items-center">
              <svg className="w-6 h-6 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              2. Upload Logo (Optional)
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Add a logo that will be centered on all panels
            </p>

            {globalLogo ? (
              <div className="mb-4">
                <div className="w-40 h-40 mx-auto mb-3 bg-gray-700 rounded-lg border-2 border-green-500 p-2">
                  <Image
                    src={globalLogo}
                    alt="Logo"
                    width={150}
                    height={150}
                    className="object-contain w-full h-full"
                  />
                </div>
                <p className="text-green-400 text-sm text-center mb-3">✓ Logo uploaded</p>

                {/* Background Removal Progress */}
                {backgroundRemovalProgress && (
                  <div className="mb-3 p-3 bg-blue-900 rounded text-center text-sm">
                    {backgroundRemovalProgress}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleRemoveBackground}
                    disabled={isRemovingBackground}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded transition-colors flex items-center justify-center"
                  >
                    {isRemovingBackground ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Remove Background
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => globalLogoInputRef.current?.click()}
                    disabled={isRemovingBackground}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                  >
                    Change Logo
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => globalLogoInputRef.current?.click()}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded transition-colors border border-gray-600"
              >
                Choose Logo File
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700"></div>

          {/* Background Section */}
          <div>
            <h3 className="text-xl font-bold mb-3 flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              3. Set Background (Optional)
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Choose a background color or image for all panels
            </p>

            <div className="flex gap-4 justify-center mb-6">
              <button
                onClick={() => setGlobalBackgroundType('color')}
                className={`px-6 py-2 rounded transition-colors ${
                  globalBackgroundType === 'color'
                    ? 'bg-gray-900 text-white border-2 border-green-500'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                Solid Color
              </button>
              <button
                onClick={() => setGlobalBackgroundType('image')}
                className={`px-6 py-2 rounded transition-colors ${
                  globalBackgroundType === 'image'
                    ? 'bg-gray-900 text-white border-2 border-green-500'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
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
                    className="w-20 h-12 rounded border-2 border-gray-600 cursor-pointer"
                  />
                  <span className="text-sm text-gray-400 font-mono">{globalBackgroundColor}</span>
                </div>
                <p className="text-xs text-gray-400 text-center">Color will be applied to all panels</p>
              </div>
            ) : (
              <div className="space-y-4">
                {globalBackgroundImage && (
                  <div className="mb-4">
                    <div className="w-full h-32 mx-auto mb-3 bg-gray-700 rounded-lg border-2 border-green-500 p-2">
                      <Image
                        src={globalBackgroundImage}
                        alt="Background"
                        width={300}
                        height={120}
                        className="object-cover w-full h-full rounded"
                      />
                    </div>
                    <p className="text-green-400 text-sm text-center">✓ Background image uploaded</p>
                  </div>
                )}
                <button
                  onClick={() => globalBackgroundInputRef.current?.click()}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-6 rounded transition-colors"
                >
                  {globalBackgroundImage ? 'Change Background Image' : 'Choose Background Image'}
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700"></div>

          {/* Flag Color Section */}
          <div>
            <h3 className="text-xl font-bold mb-3 flex items-center">
              <svg className="w-6 h-6 mr-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              4. Flag Color (Optional)
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Set the color for the flag on the 3D model
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <label className="text-sm text-gray-300">Flag Color:</label>
                <input
                  type="color"
                  value={flagColor || '#ff0000'}
                  onChange={(e) => onFlagColorChange?.(e.target.value)}
                  className="w-20 h-12 rounded border-2 border-red-600 cursor-pointer"
                />
                <span className="text-sm text-gray-400 font-mono">{flagColor || '#ff0000'}</span>
              </div>
              <p className="text-xs text-gray-400 text-center">This color will be applied to the flag material on the 3D model</p>
            </div>
          </div>

          {/* Generate Button */}
          <div className="pt-4">
            <button
              onClick={onContinue}
              disabled={!canContinue || isGenerating}
              className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold py-5 px-8 rounded-lg transition-all shadow-lg hover:shadow-pink-500/50 text-xl flex items-center justify-center gap-3"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <span className="text-2xl">✨</span>
                  GENERATE
                  <span className="text-2xl">✨</span>
                </>
              )}
            </button>

            {/* Loading Indicator */}
            {isGenerating && generationProgress && (
              <div className="mt-4 p-4 bg-gradient-to-r from-pink-900/50 to-purple-900/50 rounded-lg border border-pink-500/30">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse"></div>
                  <p className="text-white font-medium">Generation in Progress</p>
                </div>
                <p className="text-pink-200 text-sm mb-3">{generationProgress}</p>

                {/* Show what's being generated */}
                <div className="space-y-2 text-xs">
                  {globalPrompt && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-gray-300">
                        Prompt: <span className="text-white italic">&ldquo;{globalPrompt.substring(0, 60)}{globalPrompt.length > 60 ? '...' : ''}&rdquo;</span>
                      </span>
                    </div>
                  )}
                  {globalLogo && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-gray-300">Logo uploaded</span>
                    </div>
                  )}
                  {referenceImage && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-gray-300">Reference image uploaded</span>
                    </div>
                  )}
                  {globalBackgroundImage && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-gray-300">Background image uploaded</span>
                    </div>
                  )}
                  {globalBackgroundType === 'color' && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-gray-300">Background color: {globalBackgroundColor}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!canContinue && !isGenerating && (
              <p className="text-gray-400 text-sm mt-3 text-center">
                Add at least one: AI prompt, logo, background, or reference image
              </p>
            )}
            {canContinue && !isGenerating && (
              <p className="text-gray-400 text-sm mt-3 text-center">
                Click generate to create your design with AI
              </p>
            )}
          </div>

          <div className="mt-6 text-xs text-gray-500 text-center space-y-1">
            <p>Supported formats: PNG, JPG, JPEG, SVG</p>
            <p>Transparent backgrounds recommended for logos</p>
          </div>
        </div>
      </div>

      {/* Hidden File Inputs */}
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
      <input
        ref={referenceImageInputRef}
        type="file"
        accept="image/*"
        onChange={uploadReferenceImage}
        className="hidden"
      />
    </div>
  );
};

export default StartWithAIMode;
