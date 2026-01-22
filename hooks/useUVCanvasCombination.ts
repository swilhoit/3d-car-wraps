import { Dispatch } from 'react';
import { EditorAction, Panel, DesignEditorState, EditorMode } from './useUVEditorState';
import { getLogoOverlayPath, getPanelMaskPath } from '@/lib/panelUtils';

interface UseUVCanvasCombinationProps {
  dispatch: Dispatch<EditorAction>;
  panelStates: Panel[];
  isSidesLinked: boolean;
  globalLogo: string | null;
  globalBackgroundType: 'color' | 'image';
  globalBackgroundColor: string;
  globalBackgroundImage: string | null;
  flagColor?: string;
  designName: string;
  clientName: string;
  imageLibrary: NonNullable<DesignEditorState['imageLibrary']>;
  existingDesign?: { editorState?: DesignEditorState } | null;
  editorMode: EditorMode;
  currentPanelIndex: number;
  selectedModel: string;
  isGlobalMode: boolean;
  prompt: string;
  globalPrompt: string;
  onComplete: (data: {
    uvMapUrl: string;
    thumbnailUrl?: string;
    designName: string;
    clientName: string;
    editorState: DesignEditorState;
    flagColor?: string;
  }) => void;
}

export function useUVCanvasCombination({
  dispatch,
  panelStates,
  isSidesLinked,
  globalLogo,
  globalBackgroundType,
  globalBackgroundColor,
  globalBackgroundImage,
  flagColor,
  designName,
  clientName,
  imageLibrary,
  existingDesign,
  editorMode,
  currentPanelIndex,
  selectedModel,
  isGlobalMode,
  prompt,
  globalPrompt,
  onComplete
}: UseUVCanvasCombinationProps) {

  const combineAndFinish = async () => {
    // Check if all panels are completed (have images or background colors)
    const isPanelCompleted = (panel: Panel) => !!(panel.backgroundColor || panel.backgroundImage);
    
    const incompletePanels = panelStates.filter((panel: Panel) => !isPanelCompleted(panel));
    if (incompletePanels.length > 0) {
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Missing panels: ${incompletePanels.map((p: Panel) => p.name).join(', ')}. Please add images or background colors to all panels first.` });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);
      return;
    }

    dispatch({ type: 'SET_IS_COMBINING', payload: true });
    dispatch({ type: 'SET_IS_GENERATING', payload: true });
    dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Combining panels into UV map...' });

    try {
      // Use browser canvas to combine images
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Sync LEFT panel with RIGHT panel if sides are linked (final check)
      // Clone the array to avoid mutating state directly
      let currentPanelStates = [...panelStates];
      if (isSidesLinked) {
        const rightPanel = currentPanelStates.find((p: Panel) => p.name === 'RIGHT');
        const leftPanelIndex = currentPanelStates.findIndex((p: Panel) => p.name === 'LEFT');
        
        if (rightPanel && leftPanelIndex !== -1) {
          currentPanelStates[leftPanelIndex] = {
            ...currentPanelStates[leftPanelIndex],
            // Copy content from RIGHT to LEFT
            generatedImage: undefined, // Clear legacy
            backgroundImage: rightPanel.backgroundImage ? { ...rightPanel.backgroundImage } : undefined,
            backgroundColor: rightPanel.backgroundColor,
            logo: rightPanel.logo ? { ...rightPanel.logo } : undefined
          };
          console.log('✅ LEFT panel synced with RIGHT panel');
        }
      }

      // Load all panel images and find dimensions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const panelData: { img?: HTMLImageElement; panel: Panel; originalWidth: number; originalHeight: number; }[] = [];
      let maxWidth = 512; // Default width for color panels

      console.log('Loading panel images and processing colors...');
      for (let i = 0; i < currentPanelStates.length; i++) {
        const panel = currentPanelStates[i];
        
        // Load template for panel dimensions
        const img = new window.Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
          img.onload = () => {
            // Use panel.width/height (template dimensions) for panel size
            panelData.push({
              img,
              panel,
              originalWidth: panel.width || img.width,
              originalHeight: panel.height || img.height
            });
            maxWidth = Math.max(maxWidth, panel.width || img.width);
            resolve(img);
          };
          img.onerror = reject;
          img.src = panel.templatePath;
        });
      }

      // Calculate normalized dimensions - all panels will be resized to maxWidth
      const normalizedPanels = panelData.map(data => {
        const aspectRatio = data.originalHeight / data.originalWidth;
        const normalizedHeight = Math.round(maxWidth * aspectRatio);
        return {
          ...data,
          normalizedWidth: maxWidth,
          normalizedHeight
        };
      });

      const totalHeight = normalizedPanels.reduce((sum, panel) => sum + panel.normalizedHeight, 0);

      // Set canvas size
      canvas.width = maxWidth;
      canvas.height = totalHeight;

      // Draw panels vertically with normalized widths
      let currentY = 0;
      for (let i = 0; i < normalizedPanels.length; i++) {
        const panelInfo = normalizedPanels[i];
        const { panel, normalizedWidth, normalizedHeight } = panelInfo;

        // ===== START PANEL CLIPPING REGION =====
        // Save context state before clipping
        ctx!.save();

        // Create clipping region for this panel's bounds
        ctx!.beginPath();
        ctx!.rect(0, currentY, normalizedWidth, normalizedHeight);
        ctx!.clip();

        // LAYER 1: Background color (if set)
        if (panel.backgroundColor) {
          ctx!.fillStyle = panel.backgroundColor;
          ctx!.fillRect(0, currentY, normalizedWidth, normalizedHeight);
        }

        // LAYER 2: Background image (if present)
        if (panel.backgroundImage) {
          const bgImg = new window.Image();
          bgImg.crossOrigin = 'anonymous';
          
          await new Promise((resolve) => {
            bgImg.onload = () => {
              // Scale factors for normalized dimensions
              const widthScale = normalizedWidth / panelInfo.originalWidth;
              const heightScale = normalizedHeight / panelInfo.originalHeight;

              // Calculate the target box
              const targetX = panel.backgroundImage!.x * widthScale;
              const targetY = panel.backgroundImage!.y * heightScale;
              const targetWidth = panel.backgroundImage!.width * widthScale;
              const targetHeight = panel.backgroundImage!.height * heightScale;

              // OBJECT-COVER behavior
              const imageAspect = bgImg.naturalWidth / bgImg.naturalHeight;
              const boxAspect = targetWidth / targetHeight;

              let drawWidth, drawHeight, offsetX, offsetY;
              
              if (boxAspect > imageAspect) {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imageAspect;
                offsetX = 0;
                offsetY = (targetHeight - drawHeight) / 2;
              } else {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imageAspect;
                offsetX = (targetWidth - drawWidth) / 2;
                offsetY = 0;
              }

              // Save context state
              ctx!.save();

              // Create clipping region for the user-defined box
              ctx!.beginPath();
              ctx!.rect(targetX, currentY + targetY, targetWidth, targetHeight);
              ctx!.clip();

              // Draw the background image
              ctx!.drawImage(
                bgImg,
                targetX + offsetX,
                currentY + targetY + offsetY,
                drawWidth,
                drawHeight
              );

              // Restore context state
              ctx!.restore();
              resolve(bgImg);
            };
            bgImg.onerror = (error) => {
              console.warn(`Failed to load background image for ${panel.name}:`, error);
              resolve(null);
            };
            bgImg.src = panel.backgroundImage!.image;
          });
        }

        // LAYER 3: Logo (if present)
        if (panel.logo && (panel.backgroundImage || panel.backgroundColor)) {
          const logoImg = new window.Image();
          logoImg.crossOrigin = 'anonymous';

          await new Promise((resolve) => {
            logoImg.onload = () => {
              // Scale factors for normalized dimensions
              const widthScale = normalizedWidth / panelInfo.originalWidth;
              const heightScale = normalizedHeight / panelInfo.originalHeight;

              // Calculate target box
              const targetLogoWidth = panel.logo!.width * widthScale;
              const targetLogoHeight = panel.logo!.height * heightScale;
              const targetLogoX = panel.logo!.x * widthScale;
              const targetLogoY = panel.logo!.y * heightScale;
              
              // CRITICAL: Maintain logo aspect ratio (object-fit: contain behavior)
              const logoAspectRatio = logoImg.naturalWidth / logoImg.naturalHeight;
              const targetAspectRatio = targetLogoWidth / targetLogoHeight;
              
              let actualLogoWidth, actualLogoHeight;
              if (targetAspectRatio > logoAspectRatio) {
                actualLogoHeight = targetLogoHeight;
                actualLogoWidth = targetLogoHeight * logoAspectRatio;
              } else {
                actualLogoWidth = targetLogoWidth;
                actualLogoHeight = targetLogoWidth / logoAspectRatio;
              }
              
              // CENTER the logo within the target box
              const centerOffsetX = (targetLogoWidth - actualLogoWidth) / 2;
              const centerOffsetY = (targetLogoHeight - actualLogoHeight) / 2;
              
              const finalLogoX = targetLogoX + centerOffsetX;
              const finalLogoY = currentY + targetLogoY + centerOffsetY;

              // Draw the logo
              ctx!.drawImage(
                logoImg,
                finalLogoX,
                finalLogoY,
                actualLogoWidth,
                actualLogoHeight
              );
              resolve(logoImg);
            };
            logoImg.onerror = (error) => {
              console.warn(`Failed to load logo for ${panel.name}:`, error);
              resolve(null);
            };
            logoImg.src = panel.logo!.image;
          });
        }

        // LAYER 5: Logo overlay (if enabled)
        if (panel.logoOverlay?.enabled) {
          const overlayPath = getLogoOverlayPath(panel, panel.logoOverlay.variant);
          if (overlayPath) {
            const overlayImg = new window.Image();
            overlayImg.crossOrigin = 'anonymous';

            await new Promise((resolve) => {
              overlayImg.onload = () => {
                ctx!.drawImage(
                  overlayImg,
                  0,
                  currentY,
                  normalizedWidth,
                  normalizedHeight
                );
                resolve(overlayImg);
              };
              overlayImg.onerror = () => resolve(null);
              overlayImg.src = overlayPath;
            });
          }
        }

        // LAYER 6: Panel mask (final layer)
        const maskPath = getPanelMaskPath(panel);
        if (maskPath) {
          const maskImg = new window.Image();
          maskImg.crossOrigin = 'anonymous';

          await new Promise((resolve) => {
            maskImg.onload = () => {
              ctx!.drawImage(
                maskImg,
                0,
                currentY,
                normalizedWidth,
                normalizedHeight
              );
              resolve(maskImg);
            };
            maskImg.onerror = () => resolve(null);
            maskImg.src = maskPath;
          });
        }

        // ===== END PANEL CLIPPING REGION =====
        ctx!.restore();

        currentY += normalizedHeight;
      }

      // Convert to data URL
      const combinedDataUrl = canvas.toDataURL('image/png');
      console.log('Combined UV map created');

      const editorState: DesignEditorState = {
        panelStates: currentPanelStates,
        editorConfig: {
          editorMode,
          currentPanelIndex,
          selectedModel,
          isSidesLinked,
          isGlobalMode
        },
        prompts: {
          prompt,
          globalPrompt
        },
        globalSettings: {
          globalLogo: globalLogo || undefined,
          globalBackgroundType,
          globalBackgroundColor,
          globalBackgroundImage: globalBackgroundImage || undefined,
          flagColor: flagColor || undefined
        },
        designInfo: {
          designName: designName || 'UV Design',
          clientName: clientName || 'Unknown Client',
          createdAt: existingDesign?.editorState?.designInfo?.createdAt || new Date().toISOString(),
          lastModified: new Date().toISOString()
        },
        imageLibrary: imageLibrary || [],
        version: '1.0.0'
      };

      // Generate thumbnail from RIGHT or LEFT panel
      console.log('🖼️ Generating thumbnail from RIGHT/LEFT panel...');
      let thumbnailUrl = combinedDataUrl; // Fallback to full UV map

      try {
        // Find RIGHT panel first, fall back to LEFT if not found
        const thumbnailPanel = currentPanelStates.find((p: Panel) =>
          p.name === 'RIGHT'
        ) || currentPanelStates.find((p: Panel) =>
          p.name === 'LEFT'
        );

        if (thumbnailPanel) {
          // Create a separate canvas for the thumbnail
          const thumbCanvas = document.createElement('canvas');
          const thumbCtx = thumbCanvas.getContext('2d');

          // Set thumbnail size
          const thumbSize = 512;
          thumbCanvas.width = thumbSize;
          thumbCanvas.height = thumbSize;

          if (thumbCtx) {
            // Use COVER behavior - scale to fill entire thumbnail, crop edges
            const scale = Math.max(
              thumbSize / thumbnailPanel.width,
              thumbSize / thumbnailPanel.height
            );
            // Center the scaled panel (some parts will be cropped)
            const scaledWidth = thumbnailPanel.width * scale;
            const scaledHeight = thumbnailPanel.height * scale;
            const offsetX = (thumbSize - scaledWidth) / 2;
            const offsetY = (thumbSize - scaledHeight) / 2;

            // Fill background color if set
            if (thumbnailPanel.backgroundColor) {
              thumbCtx.fillStyle = thumbnailPanel.backgroundColor;
              thumbCtx.fillRect(0, 0, thumbSize, thumbSize);
            }

            // Draw background image if present
            if (thumbnailPanel.backgroundImage?.image) {
              const bgImg = new window.Image();
              bgImg.crossOrigin = 'anonymous';
              await new Promise((resolve, reject) => {
                bgImg.onload = () => {
                  if (thumbnailPanel.backgroundImage) {
                    // Calculate background position/size relative to scaled panel
                    const bgScaleX = (thumbnailPanel.backgroundImage.width * scale) / bgImg.width;
                    const bgScaleY = (thumbnailPanel.backgroundImage.height * scale) / bgImg.height;
                    // Use uniform scale for background (no stretching)
                    const bgScale = Math.max(bgScaleX, bgScaleY);
                    const bgWidth = bgImg.width * bgScale;
                    const bgHeight = bgImg.height * bgScale;
                    const bgX = offsetX + (thumbnailPanel.backgroundImage.x * scale);
                    const bgY = offsetY + (thumbnailPanel.backgroundImage.y * scale);

                    thumbCtx!.drawImage(bgImg, bgX, bgY, bgWidth, bgHeight);
                  }
                  resolve(bgImg);
                };
                bgImg.onerror = reject;
                bgImg.src = thumbnailPanel.backgroundImage!.image;
              });
            }

            // Draw logo if present
            if (thumbnailPanel.logo?.image) {
              const logoImg = new window.Image();
              logoImg.crossOrigin = 'anonymous';
              await new Promise((resolve, reject) => {
                logoImg.onload = () => {
                  if (thumbnailPanel.logo) {
                    // Maintain logo aspect ratio
                    const logoTargetWidth = thumbnailPanel.logo.width * scale;
                    const logoTargetHeight = thumbnailPanel.logo.height * scale;
                    const logoAspect = logoImg.width / logoImg.height;
                    const targetAspect = logoTargetWidth / logoTargetHeight;

                    let logoWidth, logoHeight;
                    if (targetAspect > logoAspect) {
                      logoHeight = logoTargetHeight;
                      logoWidth = logoHeight * logoAspect;
                    } else {
                      logoWidth = logoTargetWidth;
                      logoHeight = logoWidth / logoAspect;
                    }

                    // Center logo within its target box
                    const logoX = offsetX + (thumbnailPanel.logo.x * scale) + (logoTargetWidth - logoWidth) / 2;
                    const logoY = offsetY + (thumbnailPanel.logo.y * scale) + (logoTargetHeight - logoHeight) / 2;

                    thumbCtx!.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
                  }
                  resolve(logoImg);
                };
                logoImg.onerror = reject;
                logoImg.src = thumbnailPanel.logo!.image;
              });
            }

            // Draw logo overlay
            if (thumbnailPanel.logoOverlay?.enabled) {
              const overlayPath = getLogoOverlayPath(thumbnailPanel, thumbnailPanel.logoOverlay.variant);
              if (overlayPath) {
                const overlayImg = new window.Image();
                overlayImg.crossOrigin = 'anonymous';
                await new Promise((resolve) => {
                  overlayImg.onload = () => {
                    thumbCtx!.drawImage(overlayImg, offsetX, offsetY, scaledWidth, scaledHeight);
                    resolve(overlayImg);
                  };
                  overlayImg.onerror = () => resolve(null);
                  overlayImg.src = overlayPath;
                });
              }
            }

            // Skip panel mask for thumbnail - it would crop content we want to show
            // The thumbnail should show the design content, not the panel shape

            thumbnailUrl = thumbCanvas.toDataURL('image/png');
          }
        }
      } catch (error) {
        console.error('Failed to generate thumbnail from panel:', error);
      }

      onComplete({
        uvMapUrl: combinedDataUrl,
        thumbnailUrl,
        designName: designName || 'UV Design',
        clientName: clientName || 'Unknown Client',
        editorState,
        flagColor
      });
    } catch (error) {
      console.error('Combine error:', error);
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Failed to combine panels. Please try again.' });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 5000);
    } finally {
      dispatch({ type: 'SET_IS_GENERATING', payload: false });
      dispatch({ type: 'SET_IS_COMBINING', payload: false });
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' });
    }
  };

  return { combineAndFinish };
}
