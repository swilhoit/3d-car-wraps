import { Dispatch, ChangeEvent } from 'react';
import { EditorAction, Panel, BASE_PANELS } from './useUVEditorState';
import { compressImage, fileToDataURL } from '@/lib/imageCompression';
import { getLogoOverlayPath } from '@/lib/panelUtils';

// Panel relationships for symmetric editing
const panelRelationships = {
  sides: {
    master: 'RIGHT',
    slave: 'LEFT',
    masterIndex: 0,
    slaveIndex: 1
  }
};

interface UseUVImageUploadProps {
  dispatch: Dispatch<EditorAction>;
  panelStates: Panel[];
  currentPanel: Panel;
  isGlobalMode: boolean;
  isSidesLinked: boolean;
  globalLogo: string | null;
  globalBackgroundType: 'color' | 'image';
  globalBackgroundColor: string;
  globalBackgroundImage: string | null;
  globalReferenceImage: string | null;
  globalPrompt: string;
  designName: string;
  generateAllPanels?: () => Promise<void>; // Optional function to trigger AI generation
}

export function useUVImageUpload({
  dispatch,
  panelStates,
  currentPanel,
  isGlobalMode,
  isSidesLinked,
  globalLogo,
  globalBackgroundType,
  globalBackgroundColor,
  globalBackgroundImage,
  globalReferenceImage,
  globalPrompt,
  designName,
  generateAllPanels
}: UseUVImageUploadProps) {

  // Helper to apply changes to all panels
  const applyToAllPanels = (updateFn: (panel: Panel) => Panel) => {
    dispatch({ type: 'SET_PANEL_STATES', payload: panelStates.map(updateFn) });
  };

  // Helper function to apply same image to slave panel
  const applySameImageToSlave = async (masterImage: string) => {
    if (!isSidesLinked) return;

    try {
      // Use functional update logic
      const masterPanel = panelStates[panelRelationships.sides.masterIndex];
      
      const updatedPanels = panelStates.map((panel, index) => {
        if (index === panelRelationships.sides.slaveIndex) {
          return {
            ...panel,
            // Generated image is stored in backgroundImage for consistency
            backgroundImage: {
              image: masterImage,
              x: 0,
              y: 0,
              width: panel.width,
              height: panel.height
            },
            generatedImage: undefined, // Clear legacy field
            // Preserve logo from master panel
            logo: masterPanel.logo,
            // Preserve background color from master panel
            backgroundColor: masterPanel.backgroundColor,
          };
        }
        return panel;
      });
      
      dispatch({ type: 'SET_PANEL_STATES', payload: updatedPanels });
    } catch (error) {
      console.error('Failed to copy image:', error);
    }
  };

  const uploadPanelImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('File selected:', file.name);
    try {
      const result = await fileToDataURL(file);
      console.log('Image loaded successfully');

      // Get actual image dimensions to maintain aspect ratio
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = result;
      });

      // Calculate dimensions that maintain aspect ratio (cover mode)
      const imgAspect = img.width / img.height;
      const panelAspect = currentPanel.width / currentPanel.height;

      let finalWidth: number;
      let finalHeight: number;
      let x: number;
      let y: number;

      if (imgAspect > panelAspect) {
        // Image is wider - fit to height, center horizontally
        finalHeight = currentPanel.height;
        finalWidth = currentPanel.height * imgAspect;
        x = (currentPanel.width - finalWidth) / 2;
        y = 0;
      } else {
        // Image is taller - fit to width, center vertically
        finalWidth = currentPanel.width;
        finalHeight = currentPanel.width / imgAspect;
        x = 0;
        y = (currentPanel.height - finalHeight) / 2;
      }

      dispatch({
        type: 'UPDATE_PANEL',
        payload: {
          panelId: currentPanel.id,
          updates: {
            // Uploaded images are stored as backgroundImage with proper aspect ratio
            backgroundImage: {
              image: result,
              x: x,
              y: y,
              width: finalWidth,
              height: finalHeight
            }
          }
        }
      });

      // Add to image library
      dispatch({
        type: 'ADD_TO_IMAGE_LIBRARY',
        payload: {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          imageUrl: result,
          thumbnailUrl: result,
          createdAt: new Date().toISOString(),
          source: 'uploaded'
        }
      });

      // Apply same image if this is the RIGHT panel and sides are linked
      if (currentPanel.name === 'RIGHT' && isSidesLinked) {
        await applySameImageToSlave(result);
      }
    } catch (error) {
      console.error('Error uploading panel image:', error);
    }

    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  const clearPanel = () => {
    if (isGlobalMode) {
      // Clear all panels - remove all content
      applyToAllPanels(panel => ({
        ...panel,
        backgroundColor: undefined,
        logo: undefined,
        backgroundImage: undefined,
        referenceImage: undefined,
      }));
      return;
    }
    // Clear current panel - remove all content
    dispatch({ type: 'SET_PANEL_STATES', payload: panelStates.map((panel: Panel) =>
      panel.id === currentPanel.id
        ? {
            ...panel,
            backgroundColor: undefined,
            logo: undefined,
            backgroundImage: undefined,
            referenceImage: undefined,
          }
        : panel
    ) });
  };

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('Logo file selected:', file.name);
    try {
      const result = await fileToDataURL(file);
      console.log('Logo loaded successfully');

      if (isGlobalMode) {
        // Apply to all panels with proper centering per panel
        applyToAllPanels(panel => {
          // FRONT and BACK panels: smaller logo (20%) positioned at top
          if (panel.name === 'FRONT' || panel.name === 'BACK') {
            const logoSize = Math.round(panel.width * 0.20);
            const centerX = Math.round((panel.width - logoSize) / 2);
            const topY = Math.round(panel.height * 0.05); // 5% from top

            return {
              ...panel,
              logo: {
                image: result,
                x: centerX,
                y: topY,
                width: logoSize,
                height: logoSize
              }
            };
          }

          // All other panels: standard size (40%) centered
          const logoSize = Math.round(panel.width * 0.4);
          const centerX = Math.round((panel.width - logoSize) / 2);
          const centerY = Math.round((panel.height - logoSize) / 2);

          return {
            ...panel,
            logo: {
              image: result,
              x: centerX,
              y: centerY,
              width: logoSize,
              height: logoSize
            }
          };
        });
      } else {
        // Apply to current panel with proper centering
        dispatch({ type: 'UPDATE_PANEL', payload: {
          panelId: currentPanel.id,
          updates: (() => {
            // FRONT and BACK panels: smaller logo (20%) positioned at top
            if (currentPanel.name === 'FRONT' || currentPanel.name === 'BACK') {
              const logoSize = Math.round(currentPanel.width * 0.20);
              const centerX = Math.round((currentPanel.width - logoSize) / 2);
              const topY = Math.round(currentPanel.height * 0.05); // 5% from top

              return {
                logo: {
                  image: result,
                  x: centerX,
                  y: topY,
                  width: logoSize,
                  height: logoSize
                }
              };
            }

            // All other panels: standard size (40%) centered
            const logoSize = Math.round(currentPanel.width * 0.4);
            const centerX = Math.round((currentPanel.width - logoSize) / 2);
            const centerY = Math.round((currentPanel.height - logoSize) / 2);

            return {
              logo: {
                image: result,
                x: centerX,
                y: centerY,
                width: logoSize,
                height: logoSize
              }
            };
          })()
        }});
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
    }

    // Reset the input
    event.target.value = '';
  };

  const removeLogo = () => {
    if (isGlobalMode) {
      applyToAllPanels(panel => ({ ...panel, logo: undefined }));
      return;
    }
    dispatch({
      type: 'UPDATE_PANEL',
      payload: {
        panelId: currentPanel.id,
        updates: { logo: undefined }
      }
    });
  };

  // Analyze reference image with GPT Vision API (server-side)
  const analyzeReferenceImage = async (imageBase64: string): Promise<string | null> => {
    try {
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Analyzing reference image style...' });

      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64
        })
      });

      if (!response.ok) {
        console.error('Image analysis API error:', await response.text());
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' });
        return null;
      }

      const data = await response.json();
      console.log('Image analysis result:', data.description);
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' });
      return data.description;
    } catch (error) {
      console.error('Failed to analyze reference image:', error);
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' });
      return null;
    }
  };

  const uploadReferenceImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Convert to Data URL
      const dataUrl = await fileToDataURL(file);
      
      // Compress the image to reduce payload size (aggressive compression to avoid 413 errors)
      // Max 512px, 0.5MB
      const compressedImage = await compressImage(dataUrl, 0.5, 512);
      console.log('Reference image compressed successfully');

      if (isGlobalMode) {
        // Apply reference image to all panels
        applyToAllPanels(panel => ({ ...panel, referenceImage: compressedImage }));
      } else {
        // Analyze the image to get a description for individual panel
        const description = await analyzeReferenceImage(compressedImage);

        dispatch({
          type: 'UPDATE_PANEL',
          payload: {
            panelId: currentPanel.id,
            updates: {
              referenceImage: compressedImage,
              referenceDescription: description || undefined
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to process reference image:', error);
    }

    // Reset the input
    event.target.value = '';
  };

  const removeReferenceImage = () => {
    if (isGlobalMode) {
      applyToAllPanels(panel => ({ ...panel, referenceImage: undefined }));
    } else {
      dispatch({
        type: 'UPDATE_PANEL',
        payload: {
          panelId: currentPanel.id,
          updates: { referenceImage: undefined }
        }
      });
    }
  };

  const uploadGlobalLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await fileToDataURL(file);
      console.log('Global logo loaded successfully');
      dispatch({ type: 'SET_GLOBAL_LOGO', payload: result });
    } catch (error) {
      console.error('Error uploading global logo:', error);
    }

    // Reset the input
    event.target.value = '';
  };

  const uploadGlobalBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await fileToDataURL(file);
      console.log('Global background loaded successfully');
      dispatch({ type: 'SET_GLOBAL_BACKGROUND_IMAGE', payload: result });
    } catch (error) {
      console.error('Error uploading global background:', error);
    }

    // Reset the input
    event.target.value = '';
  };

  const handleStartWithAIContinue = async () => {
    // Temporarily disable sides linking to ensure all panels get content independently
    const wasLinked = isSidesLinked;
    dispatch({ type: 'SET_IS_SIDES_LINKED', payload: false });

    // Apply both logo and background in a SINGLE state update to avoid conflicts
    const updatedPanels = panelStates.map((panel: Panel) => {
      const updates: Partial<Panel> = { ...panel };

      // Apply logo if one was uploaded (skip TOP FRONT panel)
      if (globalLogo && panel.name !== 'TOP FRONT') {
        // FRONT and BACK panels: smaller logo (20%) positioned at top
        if (panel.name === 'FRONT' || panel.name === 'BACK') {
          const logoSize = Math.round(panel.width * 0.20);
          const centerX = Math.round((panel.width - logoSize) / 2);
          const topY = Math.round(panel.height * 0.05); // 5% from top

          updates.logo = {
            image: globalLogo,
            x: centerX,
            y: topY,
            width: logoSize,
            height: logoSize
          };
        } else {
          // All other panels: standard size (40%) centered
          const logoSize = Math.round(panel.width * 0.4);
          const centerX = Math.round((panel.width - logoSize) / 2);
          const centerY = Math.round((panel.height - logoSize) / 2);

          updates.logo = {
            image: globalLogo,
            x: centerX,
            y: centerY,
            width: logoSize,
            height: logoSize
          };
        }
      }

      // Apply background
      if (globalBackgroundType === 'color') {
        updates.backgroundColor = globalBackgroundColor;
      } else if (globalBackgroundType === 'image' && globalBackgroundImage) {
        updates.generatedImage = undefined; // Clear legacy
        updates.backgroundImage = {
          image: globalBackgroundImage,
          x: 0,
          y: 0,
          width: panel.width,
          height: panel.height
        };
        updates.backgroundColor = undefined;
      }

      // Apply reference image if one was uploaded
      if (globalReferenceImage) {
        updates.referenceImage = globalReferenceImage;
      }

      return updates as Panel;
    });

    console.log('🎨 handleStartWithAIContinue: Applying content to panels', {
      hasLogo: !!globalLogo,
      hasBackgroundImage: !!globalBackgroundImage,
      backgroundType: globalBackgroundType,
      backgroundColor: globalBackgroundColor
    });

    dispatch({ type: 'SET_PANEL_STATES', payload: updatedPanels });

    // Re-enable sides linking after a short delay if it was originally enabled
    setTimeout(() => {
      dispatch({ type: 'SET_IS_SIDES_LINKED', payload: wasLinked });
    }, 100);

    // If there's a global prompt, generate all panels with AI first
    if (globalPrompt && globalPrompt.trim() && generateAllPanels) {
      await generateAllPanels();
    }

    // Switch to review mode AFTER a microtask to ensure state updates are processed
    // This prevents race conditions where FabricCanvas mounts before panel state is updated
    await new Promise(resolve => setTimeout(resolve, 50));
    dispatch({ type: 'SET_EDITOR_MODE', payload: 'review-panels' });
  };

  // Apply logo overlays to a custom UV upload
  const applyLogoOverlaysToCustomUV = async (uvDataUrl: string): Promise<string> => {
    console.log('🎨 Applying logo overlays to custom UV');

    // Load the uploaded UV first to get its dimensions
    const uvImg = new window.Image();
    uvImg.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      uvImg.onload = resolve;
      uvImg.onerror = reject;
      uvImg.src = uvDataUrl;
    });

    // Use the actual UV dimensions
    const targetWidth = uvImg.width;
    const targetHeight = uvImg.height;

    console.log('📐 Custom UV dimensions:', targetWidth, 'x', targetHeight);

    // Create canvas for processing at UV's actual size
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('Failed to get canvas context');

    // Draw the uploaded UV at its original size
    ctx.drawImage(uvImg, 0, 0);
    console.log('✅ Custom UV drawn to canvas');

    // Panel definitions with their native dimensions
    const panelDefs = [
      { name: 'RIGHT', width: 2190, height: 1278, logoOverlay: BASE_PANELS[0].logoOverlay },
      { name: 'LEFT', width: 2192, height: 1247, logoOverlay: BASE_PANELS[1].logoOverlay },
      { name: 'BACK', width: 2192, height: 1248, logoOverlay: BASE_PANELS[2].logoOverlay },
      { name: 'TOP FRONT', width: 2192, height: 1248, logoOverlay: BASE_PANELS[3].logoOverlay },
      { name: 'FRONT', width: 2192, height: 1013, logoOverlay: BASE_PANELS[4].logoOverlay },
      { name: 'LID', width: 2192, height: 2175, logoOverlay: BASE_PANELS[5].logoOverlay }
    ];

    // Calculate normalized heights (same logic as useUVCanvasCombination)
    const maxPanelWidth = Math.max(...panelDefs.map(p => p.width));
    const normalizedPanels = panelDefs.map(panel => {
      const aspectRatio = panel.height / panel.width;
      const normalizedHeight = Math.round(maxPanelWidth * aspectRatio);
      return { ...panel, normalizedHeight };
    });

    // Calculate Y positions
    let currentY = 0;
    const panelPositions = normalizedPanels.map(panel => {
      const pos = { ...panel, y: currentY };
      currentY += panel.normalizedHeight;
      return pos;
    });

    const totalNormalizedHeight = currentY;

    // Scale factor from normalized to actual UV dimensions
    const scaleY = targetHeight / totalNormalizedHeight;

    // Apply logo overlays to panels that have them enabled
    for (const panel of panelPositions) {
      if (panel.logoOverlay?.enabled) {
        const overlayPath = getLogoOverlayPath({ name: panel.name } as Panel, panel.logoOverlay.variant);
        if (overlayPath) {
          const overlayImg = new window.Image();
          overlayImg.crossOrigin = 'anonymous';

          await new Promise((resolve) => {
            overlayImg.onload = () => {
              // Draw overlay at scaled panel position
              const scaledY = panel.y * scaleY;
              const scaledHeight = panel.normalizedHeight * scaleY;
              ctx.drawImage(overlayImg, 0, scaledY, targetWidth, scaledHeight);
              console.log(`✅ Applied ${panel.logoOverlay!.variant} logo overlay to ${panel.name} at y=${Math.round(scaledY)}, height=${Math.round(scaledHeight)}`);
              resolve(overlayImg);
            };
            overlayImg.onerror = (error) => {
              console.warn(`Failed to load logo overlay for ${panel.name}:`, error);
              resolve(null); // Continue even if overlay fails
            };
            overlayImg.src = overlayPath;
          });
        }
      }
    }

    // Convert to data URL
    const processedDataUrl = canvas.toDataURL('image/png');
    console.log('✅ Logo overlays applied to custom UV');
    return processedDataUrl;
  };

  // Extract individual panels from a complete UV map
  const extractPanelsFromUV = async (uvDataUrl: string): Promise<string[]> => {
    console.log('✂️ Extracting panels from UV');

    // Load the UV image
    const uvImg = new window.Image();
    uvImg.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      uvImg.onload = resolve;
      uvImg.onerror = reject;
      uvImg.src = uvDataUrl;
    });

    console.log('📐 UV image dimensions:', uvImg.width, 'x', uvImg.height);

    // Panel definitions with their native dimensions (from BASE_PANELS)
    const panelDefs = [
      { name: 'RIGHT', width: 2190, height: 1278 },
      { name: 'LEFT', width: 2192, height: 1247 },
      { name: 'BACK', width: 2192, height: 1248 },
      { name: 'TOP FRONT', width: 2192, height: 1248 },
      { name: 'FRONT', width: 2192, height: 1013 },
      { name: 'LID', width: 2192, height: 2175 }
    ];

    // The UV was created by normalizing all panels to the same width (maxWidth)
    // and stacking them vertically with heights proportional to their aspect ratios
    const maxPanelWidth = Math.max(...panelDefs.map(p => p.width)); // ~2192

    // Calculate the normalized heights (same logic as useUVCanvasCombination)
    const normalizedPanels = panelDefs.map(panel => {
      const aspectRatio = panel.height / panel.width;
      const normalizedHeight = Math.round(maxPanelWidth * aspectRatio);
      return {
        ...panel,
        normalizedHeight
      };
    });

    // Calculate Y positions based on normalized heights
    let currentY = 0;
    const panelPositions = normalizedPanels.map(panel => {
      const pos = { ...panel, y: currentY };
      currentY += panel.normalizedHeight;
      return pos;
    });

    const totalNormalizedHeight = currentY;
    console.log('📐 Expected normalized dimensions:', maxPanelWidth, 'x', totalNormalizedHeight);

    // Scale factors from UV image to normalized dimensions
    const scaleX = uvImg.width / maxPanelWidth;
    const scaleY = uvImg.height / totalNormalizedHeight;

    console.log('📐 Scale factors:', scaleX, scaleY);

    const panelImages: string[] = [];

    for (const panel of panelPositions) {
      // Create canvas for this panel at its native size
      const canvas = document.createElement('canvas');
      canvas.width = panel.width;
      canvas.height = panel.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) throw new Error('Failed to get canvas context');

      // Calculate source coordinates in the actual UV image
      const sourceX = 0;
      const sourceY = panel.y * scaleY;
      const sourceWidth = uvImg.width; // Full width of UV
      const sourceHeight = panel.normalizedHeight * scaleY;

      console.log(`✂️ Extracting ${panel.name}: source(${sourceX}, ${Math.round(sourceY)}, ${Math.round(sourceWidth)}, ${Math.round(sourceHeight)}) -> dest(${panel.width}, ${panel.height})`);

      // Extract this panel's region
      ctx.drawImage(
        uvImg,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, panel.width, panel.height
      );

      const panelDataUrl = canvas.toDataURL('image/png');
      panelImages.push(panelDataUrl);
    }

    return panelImages;
  };

  const uploadCustomUV = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Processing custom UV with logo overlays...' });

      try {
        // Apply logo overlays to the uploaded UV
        const processedUV = await applyLogoOverlaysToCustomUV(result);

        // Extract each panel from the UV and load into editor
        const panelImages = await extractPanelsFromUV(processedUV);

        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Custom UV loaded successfully! You can now edit panels and adjust the flag color.' });

        // Load panels into editor for editing
        const updatedPanels = BASE_PANELS.map((panel, index) => ({
          ...panel,
          backgroundImage: panelImages[index] ? {
            image: panelImages[index],
            x: 0,
            y: 0,
            width: panel.width,
            height: panel.height
          } : undefined
        }));

        dispatch({ type: 'SET_PANEL_STATES', payload: updatedPanels });
        dispatch({ type: 'SET_EDITOR_MODE', payload: 'review-panels' });
        dispatch({ type: 'SET_DESIGN_NAME', payload: designName || 'Custom Upload' });

        setTimeout(() => {
          dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' });
        }, 3000);
      } catch (error) {
        console.error('Failed to process custom UV:', error);
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Failed to process UV. Please try again.' });
        setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset the input
    event.target.value = '';
  };

  return {
    uploadPanelImage,
    clearPanel,
    uploadLogo,
    removeLogo,
    uploadReferenceImage,
    removeReferenceImage,
    uploadGlobalLogo,
    uploadGlobalBackground,
    handleStartWithAIContinue,
    uploadCustomUV
  };
}