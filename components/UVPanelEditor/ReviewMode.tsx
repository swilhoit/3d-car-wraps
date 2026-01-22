import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import FabricCanvas from './FabricCanvas';
import { useBackgroundRemoval } from '@/hooks/useBackgroundRemoval';

type DispatchAction = {
  type: string;
  payload?: {
    panelId?: number;
    updates?: Partial<Panel>;
    [key: string]: unknown;
  };
};

type Panel = {
  id: number;
  name: string;
  templatePath: string;
  width: number;  // Actual panel template width
  height: number; // Actual panel template height
  generatedImage?: string;
  backgroundColor?: string;
  logo?: {
    image: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  backgroundImage?: {
    image: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  logoOverlay?: {
    enabled: boolean;
    variant: 'black' | 'white';
  };
  referenceImage?: string;
};

interface ReviewModeProps {
  panelStates: Panel[];
  currentPanelIndex: number;
  setCurrentPanelIndex: (index: number) => void;
  isSidesLinked: boolean;
  setIsSidesLinked: (linked: boolean) => void;
  isGlobalMode: boolean;
  setIsGlobalMode: (global: boolean) => void;
  isPanelCompleted: (panel: Panel) => boolean;
  combineAndFinish: () => void;
  isGenerating: boolean;
  isCombining: boolean;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleLogoMouseDown: (e: React.MouseEvent) => void;
  setIsResizingLogo: (resizing: boolean) => void;
  handleBackgroundMouseDown: (e: React.MouseEvent) => void;
  setIsResizingBackground: (resizing: boolean) => void;
  designName: string;
  setDesignName: (name: string) => void;
  clientName: string;
  setClientName: (name: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  generatePanelTexture: () => void;
  updatePanelBackgroundColor: (color: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  logoInputRef: React.RefObject<HTMLInputElement>;
  referenceImageInputRef: React.RefObject<HTMLInputElement>;
  uploadPanelImage: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadLogo: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadReferenceImage: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeReferenceImage: () => void;
  removeLogo: () => void;
  clearPanel: () => void;
  generationProgress: string;
  setEditorMode: (mode: string) => void;
  globalPrompt: string;
  dispatch: React.Dispatch<DispatchAction>;
  showCutlineGuides: boolean;
  toggleCutlineGuides: () => void;
  getCutlineGuidePath: (panelName: string) => string | null;
  flagColor?: string;
  onFlagColorChange?: (color: string) => void;
  imageLibrary?: Array<{
    id: string;
    imageUrl: string;
    thumbnailUrl?: string;
    createdAt: string;
    source: 'ai-generated' | 'uploaded';
  }>;
}

const ReviewMode: React.FC<ReviewModeProps> = ({
  panelStates,
  currentPanelIndex,
  setCurrentPanelIndex,
  isSidesLinked,
  setIsSidesLinked,
  isGlobalMode,
  setIsGlobalMode,
  isPanelCompleted,
  combineAndFinish,
  isGenerating,
  isCombining,
  handleMouseMove,
  handleMouseUp,
  handleLogoMouseDown,
  setIsResizingLogo,
  handleBackgroundMouseDown,
  setIsResizingBackground,
  designName,
  setDesignName,
  clientName,
  setClientName,
  selectedModel,
  setSelectedModel,
  prompt,
  setPrompt,
  generatePanelTexture,
  updatePanelBackgroundColor,
  fileInputRef,
  logoInputRef,
  referenceImageInputRef,
  uploadPanelImage,
  uploadLogo,
  uploadReferenceImage,
  removeReferenceImage,
  removeLogo,
  clearPanel,
  generationProgress,
  setEditorMode,
  globalPrompt,
  dispatch,
  showCutlineGuides,
  toggleCutlineGuides,
  getCutlineGuidePath,
  flagColor,
  onFlagColorChange,
  imageLibrary,
}) => {
  const currentPanel = panelStates[currentPanelIndex];
  const panelRelationships = { sides: { masterIndex: 0, slaveIndex: 1 } };

  // State for background removal
  const { isRemovingBackground, backgroundRemovalProgress, removeBackgroundFromImage } = useBackgroundRemoval();

  // Helper function to get logo overlay path for a panel
  const getLogoOverlayPath = (panel: Panel, variant: 'black' | 'white'): string | null => {
    const panelName = panel.name.toUpperCase().replace(' ', '-');
    const colorSuffix = variant === 'black' ? 'BLK' : 'WHITE';

    // Map panel names to overlay filenames
    const overlayMap: { [key: string]: string | null } = {
      'RIGHT': `RIGHT-LOGO-${colorSuffix}.png`,
      'LEFT': `LEFT-LOGO-${colorSuffix}.png`,
      'BACK': `BACK-LOGO-${colorSuffix}.png`,
      'LID': `LID-LOGO-${colorSuffix}.png`,
      'TOP-FRONT': null, // No overlay for TOP FRONT
      'FRONT': null // No overlay for FRONT
    };

    const filename = overlayMap[panelName];
    return filename ? `/logo-overlays/${filename}` : null;
  };

  // Helper function to get panel mask path for a panel
  const getPanelMaskPath = (panel: Panel): string | null => {
    const panelName = panel.name.toUpperCase();

    // Map panel names to mask filenames
    const maskMap: { [key: string]: string | null } = {
      'RIGHT': 'RIGHT-mask.png',
      'LEFT': 'LEFT-mask.png',
      'BACK': 'BACK-mask.png',
      'LID': 'LID-mask.png',
      'TOP FRONT': 'TOP FRONT-mask.png',
      'FRONT': 'FRONT-mask.png'
    };

    const filename = maskMap[panelName];
    return filename ? `/panel-masks/${filename}` : null;
  };

  // Toggle logo overlay
  const toggleLogoOverlay = (enabled: boolean) => {
    const currentVariant = currentPanel.logoOverlay?.variant || 'white';
    dispatch({
      type: 'UPDATE_PANEL',
      payload: {
        panelId: currentPanel.id,
        updates: {
          logoOverlay: enabled ? { enabled: true, variant: currentVariant } : { enabled: false, variant: currentVariant }
        }
      }
    });
  };

  // Toggle logo overlay variant (black/white)
  const toggleLogoOverlayVariant = (variant: 'black' | 'white') => {
    dispatch({
      type: 'UPDATE_PANEL',
      payload: {
        panelId: currentPanel.id,
        updates: {
          logoOverlay: { enabled: currentPanel.logoOverlay?.enabled || false, variant }
        }
      }
    });
  };

  // Remove background from logo
  const handleRemoveLogoBackground = async () => {
    if (!currentPanel.logo?.image) return;

    const result = await removeBackgroundFromImage(currentPanel.logo.image);
    
    if (result) {
      // Update the logo with transparent version
      dispatch({
        type: 'UPDATE_PANEL',
        payload: {
          panelId: currentPanel.id,
          updates: {
            logo: {
              ...currentPanel.logo!,
              image: result
            }
          }
        }
      });
    }
  };

  // Debug logging for panel state
  useEffect(() => {
    console.log('🎨 ReviewMode - Current Panel:', currentPanel.name);
    console.log('📋 Panel structure:', JSON.stringify({
      name: currentPanel.name,
      hasGeneratedImage: !!currentPanel.generatedImage,
      generatedImageLength: currentPanel.generatedImage?.length,
      generatedImagePreview: currentPanel.generatedImage?.substring(0, 100),
      hasBackgroundImage: !!currentPanel.backgroundImage,
      backgroundImageDetails: currentPanel.backgroundImage ? {
        x: currentPanel.backgroundImage.x,
        y: currentPanel.backgroundImage.y,
        width: currentPanel.backgroundImage.width,
        height: currentPanel.backgroundImage.height,
        imagePreview: currentPanel.backgroundImage.image?.substring(0, 50) + '...'
      } : null,
      hasLogo: !!currentPanel.logo,
      logoDetails: currentPanel.logo ? {
        x: currentPanel.logo.x,
        y: currentPanel.logo.y,
        width: currentPanel.logo.width,
        height: currentPanel.logo.height,
        imagePreview: currentPanel.logo.image?.substring(0, 50) + '...'
      } : null,
      backgroundColor: currentPanel.backgroundColor,
      panelWidth: currentPanel.width,
      panelHeight: currentPanel.height
    }, null, 2));

  }, [currentPanel.id]); // Only reset when panel changes, not on every update

  // Note: Drag/resize state now handled by FabricCanvas component

  return (
    <div className="w-full h-screen bg-black text-white flex overflow-hidden">
      {/* Left Sidebar - Panel Previews */}
      <div className="w-56 bg-black border-r border-gray-700 flex flex-col h-full mt-16">
        <div className="p-3 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Panels</h3>
            <button
              onClick={() => setEditorMode('selection')}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              ← Back
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {panelStates.map((panel, index) => {
            if (isSidesLinked && panel.name === 'LEFT') return null;

            const isMergedSidePanel = isSidesLinked && panel.name === 'RIGHT';
            const displayName = isMergedSidePanel ? 'RIGHT & LEFT' : panel.name;
            const isActive = isGlobalMode || index === currentPanelIndex || (isMergedSidePanel && currentPanelIndex === panelRelationships.sides.slaveIndex);

            return (
              <div
                key={panel.id}
                onClick={() => !isGlobalMode && setCurrentPanelIndex(index)}
                className={`bg-gray-800 rounded-lg p-2 cursor-pointer transition-all border-2 ${
                  isGlobalMode
                    ? 'border-pink-500'
                    : isActive
                    ? 'border-gray-400'
                    : 'border-transparent hover:border-gray-600'
                }`}
              >
                <h4 className="text-xs font-medium mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    {displayName}
                    {isMergedSidePanel && <span className="text-gray-400" style={{ fontSize: '10px' }}>🔗</span>}
                  </span>
                  {isPanelCompleted(panel) && <span className="text-green-400" style={{ fontSize: '10px' }}>✓</span>}
                </h4>
                <div
                  className="relative w-full rounded overflow-hidden"
                  style={{
                    backgroundColor: panel.backgroundColor || '#374151',
                    height: `${Math.max(50, Math.min(80, (panel.height / panel.width) * 200))}px`,
                    width: '100%'
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    {/* Background Image Layer - for both AI-generated and uploaded images */}
                    {panel.backgroundImage?.image && panel.backgroundImage.width > 0 && panel.backgroundImage.height > 0 && (
                      <div
                        className="absolute"
                        style={{
                          left: `${(panel.backgroundImage.x / panel.width) * 100}%`,
                          top: `${(panel.backgroundImage.y / panel.height) * 100}%`,
                          width: `${(panel.backgroundImage.width / panel.width) * 100}%`,
                          height: `${(panel.backgroundImage.height / panel.height) * 100}%`,
                        }}
                      >
                        <Image
                          src={panel.backgroundImage.image}
                          alt={panel.name}
                          fill
                          className="object-cover"
                          unoptimized={panel.backgroundImage.image.startsWith('data:') || panel.backgroundImage.image.startsWith('http')}
                        />
                      </div>
                    )}

                    {/* Show empty state if no content */}
                    {!panel.backgroundImage && !panel.backgroundColor && (
                      <div className="flex items-center justify-center h-full text-xs text-gray-500">Empty</div>
                    )}

                    {/* Logo Layer */}
                    {panel.logo?.image && panel.logo.width > 0 && panel.logo.height > 0 && (
                      <div
                        className="absolute"
                        style={{
                          left: `${(panel.logo.x / panel.width) * 100}%`,
                          top: `${(panel.logo.y / panel.height) * 100}%`,
                          width: `${(panel.logo.width / panel.width) * 100}%`,
                          height: `${(panel.logo.height / panel.height) * 100}%`,
                        }}
                      >
                        <Image
                          src={panel.logo.image}
                          alt="Logo"
                          width={panel.logo.width}
                          height={panel.logo.height}
                          className="w-full h-full object-contain"
                          unoptimized={panel.logo.image.startsWith('data:') || panel.logo.image.startsWith('http')}
                        />
                      </div>
                    )}

                    {/* Logo Overlay in preview */}
                    {panel.logoOverlay?.enabled && getLogoOverlayPath(panel, panel.logoOverlay.variant) && (
                      <div className="absolute inset-0 pointer-events-none">
                        <Image
                          src={getLogoOverlayPath(panel, panel.logoOverlay.variant)!}
                          alt="Logo Overlay"
                          fill
                          sizes="200px"
                          style={{ objectFit: 'cover' }}
                          unoptimized={false}
                        />
                      </div>
                    )}

                    {/* Panel Mask in preview */}
                    {getPanelMaskPath(panel) && (
                      <div className="absolute inset-0 pointer-events-none">
                        <Image
                          src={getPanelMaskPath(panel)!}
                          alt="Panel Mask"
                          fill
                          sizes="200px"
                          style={{ objectFit: 'cover' }}
                          unoptimized={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => {
              setIsGlobalMode(!isGlobalMode);
              if (!isGlobalMode) setPrompt(globalPrompt);
            }}
            className={`w-full ${
              isGlobalMode ? 'bg-pink-700 border-2 border-pink-400' : 'bg-pink-600 hover:bg-pink-700'
            } text-white font-medium py-2 px-3 rounded transition-colors text-sm mt-2`}
          >
            {isGlobalMode ? '✓ Select All Panels' : 'Select All Panels'}
          </button>
        </div>

        <div className="p-3 space-y-3 border-t border-gray-700">
          <div className="text-xs text-gray-400">
            Completed: {panelStates.filter(isPanelCompleted).length} / {isSidesLinked ? 5 : 6}
          </div>
          <button
            onClick={combineAndFinish}
            disabled={isGenerating || isCombining || !panelStates.every(isPanelCompleted)}
            className="w-full bg-black hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded transition-colors text-sm border border-gray-600"
          >
            {isCombining ? 'Creating UV Map...' : 'Finalize UV Map'}
          </button>
          {!panelStates.every(isPanelCompleted) && (
            <div className="text-xs text-yellow-500 text-center">
              Add a background color or image to all panels to save
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex h-full">
        <div className="flex-1 flex flex-col p-4">
          <div className="mb-3 text-center">
            <div className="flex justify-center">
              <div className="w-96">
                <label className="block text-xs font-medium mb-1">Design Name</label>
                <input
                  type="text"
                  value={designName}
                  onChange={(e) => setDesignName(e.target.value)}
                  className="w-full bg-black border border-gray-600 text-white text-sm rounded px-3 py-2 placeholder-gray-400 text-center"
                  placeholder="Enter design name..."
                />
              </div>
            </div>
          </div>
          {(currentPanel.name === 'RIGHT' || currentPanel.name === 'LEFT') && (
            <div className="flex items-center gap-2 mb-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isSidesLinked}
                  onChange={(e) => setIsSidesLinked(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-gray-400">🔗 Copy to {currentPanel.name === 'RIGHT' ? 'LEFT' : 'RIGHT'}</span>
              </label>
            </div>
          )}
          <div className={`flex-1 flex ${currentPanel.name === 'LID' ? 'items-center overflow-auto' : 'items-center overflow-hidden'} justify-center bg-black rounded-lg p-4 mb-3 border border-gray-700`}>
            <div className="text-center w-full">
              <h4 className="text-sm font-medium mb-4 text-gray-400">{currentPanel.name} Panel Preview</h4>
              <FabricCanvas
                key={currentPanel.id}
                panel={currentPanel}
                onPanelUpdate={(updates, panelId) => {
                  dispatch({
                    type: 'UPDATE_PANEL',
                    payload: {
                      panelId: panelId || currentPanel.id, // Use provided panelId or fall back to currentPanel.id
                      updates
                    }
                  });
                }}
                logoOverlayPath={currentPanel.logoOverlay?.enabled ? getLogoOverlayPath(currentPanel, currentPanel.logoOverlay.variant) : null}
                panelMaskPath={getPanelMaskPath(currentPanel)}
                cutlineGuidePath={getCutlineGuidePath(currentPanel.name)}
                showCutlineGuides={showCutlineGuides}
                scaleFactor={(() => {
                  // Calculate base scale factor
                  const widthScale = 550 / currentPanel.width;  // Max width 550px

                  // For LID panel, use much more conservative height to account for extension
                  if (currentPanel.name === 'LID') {
                    // The extended canvas is 1.4x the scaled panel
                    // Available height is roughly 700-750px in the container
                    // So: scaledHeight * 1.4 must be < 700
                    // Therefore: scaledHeight must be < 500
                    // And: panel.height * scaleFactor * 1.4 < 700
                    // So: scaleFactor < 700 / (panel.height * 1.4)
                    const maxExtendedHeight = 500; // Conservative max for extended canvas
                    const heightScale = maxExtendedHeight / (currentPanel.height * 1.4);
                    return Math.min(widthScale, heightScale, 1);
                  }

                  const heightScale = 800 / currentPanel.height; // Max height 800px
                  const baseScale = Math.min(widthScale, heightScale, 1);
                  return baseScale;
                })()}
              />
            </div>
          </div>
        </div>

        <div className="w-96 bg-black border-l border-gray-700 flex flex-col h-full">
          <div className="p-3 border-b border-gray-700">
            <h3 className="text-lg font-medium text-center">
              {isGlobalMode ? '🌍 All Panels' : (currentPanel.name === 'RIGHT' || currentPanel.name === 'LEFT') && isSidesLinked ? '🔗 RIGHT & LEFT' : currentPanel.name}
            </h3>
          </div>
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <h4 className="text-sm font-medium mb-3 text-white">AI Generation</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">AI Model</label>
                  <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full bg-black border border-gray-600 text-white text-sm rounded px-2 py-1" disabled={isGenerating}>
                    <option value="nano-banana">nano banana pro (default)</option>
                    <option value="flux-kontext">Flux Kontext MULTI-IMAGE MAX</option>
                    <option value="openai-image">OPEN AI IMAGE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Prompt</label>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter your prompt" className="w-full bg-black border border-gray-600 text-white text-sm rounded px-2 py-1 h-20 resize-none" disabled={isGenerating} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Reference Image (Optional)</label>
                  <div className="flex gap-2">
                    <button onClick={() => referenceImageInputRef.current?.click()} disabled={isGenerating} className="flex-1 bg-black hover:bg-gray-700 disabled:bg-gray-600 text-white font-medium py-2 px-3 rounded transition-colors text-sm border border-gray-600">
                      {currentPanel.referenceImage ? 'Change Reference' : 'Add Reference'}
                    </button>
                    {currentPanel.referenceImage && (
                      <button
                        onClick={removeReferenceImage}
                        disabled={isGenerating}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium py-1 px-2 rounded transition-colors text-sm border border-red-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {currentPanel.referenceImage && (
                    <div className="mt-2 relative w-full h-20 border border-gray-600 rounded overflow-hidden">
                      <img src={currentPanel.referenceImage} alt="Reference" className="w-full h-full object-contain bg-gray-900" />
                    </div>
                  )}
                </div>
                <button onClick={generatePanelTexture} disabled={isGenerating || !prompt.trim()} className="w-full bg-black hover:bg-gray-700 disabled:bg-gray-600 text-white font-medium py-2 px-3 rounded transition-colors text-sm border border-gray-600">
                  {isGenerating ? 'Generating...' : '✨ Generate'}
                </button>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <h4 className="text-sm font-medium mb-3 text-white">Background & Logo</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Background Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={currentPanel.backgroundColor || '#ffffff'} onChange={(e) => updatePanelBackgroundColor(e.target.value)} className="w-10 h-8 rounded border border-gray-600" disabled={isGenerating} />
                      <span className="text-xs text-gray-400 flex-1 truncate">{currentPanel.backgroundColor || 'None'}</span>
                    </div>
                    {currentPanel.backgroundColor && <button onClick={() => updatePanelBackgroundColor('')} disabled={isGenerating} className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded mt-1 w-full">Clear</button>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Flag Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={flagColor || '#ff0000'} onChange={(e) => onFlagColorChange?.(e.target.value)} className="w-10 h-8 rounded border border-red-600" disabled={isGenerating} />
                      <span className="text-xs text-gray-400 flex-1 truncate">{flagColor || '#ff0000'}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Background Image</label>
                  <div className="flex gap-2">
                    <button onClick={() => fileInputRef.current?.click()} disabled={isGenerating} className="flex-1 bg-black hover:bg-gray-700 disabled:bg-gray-600 text-white font-medium py-2 px-3 rounded transition-colors text-sm border border-gray-600">
                      {currentPanel.backgroundImage ? 'Change Background' : 'Upload Background'}
                    </button>
                    {currentPanel.backgroundImage && (
                      <button
                        onClick={() => {
                          dispatch({
                            type: 'UPDATE_PANEL',
                            payload: {
                              panelId: currentPanel.id,
                              updates: {
                                backgroundImage: undefined
                              }
                            }
                          });
                        }}
                        disabled={isGenerating}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium py-1 px-2 rounded transition-colors text-sm border border-red-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {currentPanel.backgroundImage?.image && (
                    <div className="mt-2 relative w-full h-20 border border-gray-600 rounded overflow-hidden">
                      <img src={currentPanel.backgroundImage.image} alt="Background" className="w-full h-full object-contain bg-gray-900" />
                    </div>
                  )}
                  {/* Image Library Thumbnails */}
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-2 text-gray-400">
                      Image Library {imageLibrary && imageLibrary.length > 0 && `(${imageLibrary.length})`}
                    </label>
                    {imageLibrary && imageLibrary.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto border border-gray-700 rounded p-2 bg-gray-900">
                        <div className="grid grid-cols-4 gap-2">
                          {imageLibrary.map((image) => (
                            <div key={image.id} className="relative group">
                              <button
                                onClick={() => {
                                  dispatch({
                                    type: 'UPDATE_PANEL',
                                    payload: {
                                      panelId: currentPanel.id,
                                      updates: {
                                        backgroundImage: {
                                          image: image.imageUrl,
                                          x: 0,
                                          y: 0,
                                          width: currentPanel.width,
                                          height: currentPanel.height
                                        }
                                      }
                                    }
                                  });
                                }}
                                disabled={isGenerating}
                                className="w-full aspect-square border border-gray-600 rounded overflow-hidden hover:border-blue-500 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                title={`${image.source === 'ai-generated' ? '🤖 AI Generated' : '📁 Uploaded'} - ${new Date(image.createdAt).toLocaleString()}`}
                              >
                                <img
                                  src={image.thumbnailUrl || image.imageUrl}
                                  alt={`Library image ${image.id}`}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                              {/* Small badge to indicate source */}
                              <div className="absolute top-0.5 right-0.5 text-[10px] bg-black bg-opacity-80 px-1 rounded pointer-events-none">
                                {image.source === 'ai-generated' ? '🤖' : '📁'}
                              </div>
                              {/* Download button */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const response = await fetch(image.imageUrl);
                                    const blob = await response.blob();
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `${image.source === 'ai-generated' ? 'ai-generated' : 'uploaded'}-${image.id}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    URL.revokeObjectURL(url);
                                  } catch (error) {
                                    console.error('Failed to download image:', error);
                                  }
                                }}
                                className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-black bg-opacity-80 hover:bg-blue-600 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Download image"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 text-center py-4 border border-gray-700 rounded bg-gray-900">
                        No images yet. Generate or upload images to build your library.
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Logo</label>
                  <div className="flex gap-2">
                    <button onClick={() => logoInputRef.current?.click()} disabled={isGenerating} className="flex-1 bg-black hover:bg-gray-700 disabled:bg-gray-600 text-white font-medium py-2 px-3 rounded transition-colors text-sm border border-gray-600">
                      {currentPanel.logo ? 'Change Logo' : 'Add Logo'}
                    </button>
                    {currentPanel.logo && (
                      <button
                        onClick={removeLogo}
                        disabled={isGenerating}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium py-1 px-2 rounded transition-colors text-sm border border-red-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {currentPanel.logo?.image && (
                    <div className="mt-2 relative w-full h-20 border border-gray-600 rounded overflow-hidden">
                      <img src={currentPanel.logo.image} alt="Logo" className="w-full h-full object-contain bg-gray-900" />
                    </div>
                  )}
                  {currentPanel.logo && (
                    <button
                      onClick={handleRemoveLogoBackground}
                      disabled={isGenerating || isRemovingBackground}
                      className="w-full mt-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-medium py-2 px-3 rounded transition-colors text-sm border border-purple-700"
                    >
                      {isRemovingBackground ? backgroundRemovalProgress : '✨ Remove Logo Background'}
                    </button>
                  )}
                </div>
                {getLogoOverlayPath(currentPanel, 'white') && (
                  <div>
                    <label className="block text-xs font-medium mb-2">Coco Logo Overlay</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentPanel.logoOverlay?.enabled || false}
                          onChange={(e) => toggleLogoOverlay(e.target.checked)}
                          className="w-4 h-4"
                          disabled={isGenerating}
                        />
                        <span className="text-gray-300">Enable Coco Logo Overlay</span>
                      </label>
                      {currentPanel.logoOverlay?.enabled && (
                        <div className="flex gap-2 ml-6">
                          <button
                            onClick={() => toggleLogoOverlayVariant('white')}
                            disabled={isGenerating}
                            className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors border ${
                              currentPanel.logoOverlay.variant === 'white'
                                ? 'bg-white text-black border-white'
                                : 'bg-black text-white border-gray-600 hover:bg-gray-700'
                            }`}
                          >
                            White
                          </button>
                          <button
                            onClick={() => toggleLogoOverlayVariant('black')}
                            disabled={isGenerating}
                            className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors border ${
                              currentPanel.logoOverlay.variant === 'black'
                                ? 'bg-gray-900 text-white border-white'
                                : 'bg-black text-white border-gray-600 hover:bg-gray-700'
                            }`}
                          >
                            Black
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-2">Cutline Guides</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCutlineGuides}
                      onChange={toggleCutlineGuides}
                      className="w-4 h-4"
                      disabled={isGenerating}
                    />
                    <span className="text-gray-300">Show Printer Cutlines</span>
                  </label>
                </div>
              </div>
            </div>
            {generationProgress && (
              <div className="bg-gray-800 rounded-lg p-3 text-center text-sm border border-gray-700">
                {generationProgress}
              </div>
            )}
            <div className="mt-auto mb-8">
              <button
                onClick={combineAndFinish}
                disabled={!panelStates.some(isPanelCompleted) || isGenerating || isCombining}
                className={`w-full ${!panelStates.some(isPanelCompleted) || isGenerating || isCombining ? 'bg-gray-600 cursor-not-allowed' : 'bg-pink-600 hover:bg-pink-700'} text-white font-bold py-3 px-4 rounded transition-colors text-sm`}
              >
                {isCombining ? 'Saving Design...' : 'Save Design'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReviewMode);
