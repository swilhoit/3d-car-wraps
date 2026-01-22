import React, { useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';

type Panel = {
  id: number;
  name: string;
  templatePath: string;
  width: number;
  height: number;
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
};

interface FabricCanvasProps {
  panel: Panel;
  onPanelUpdate: (updates: Partial<Panel>, panelId?: number) => void;
  logoOverlayPath: string | null;
  panelMaskPath: string | null;
  cutlineGuidePath: string | null;
  showCutlineGuides: boolean;
  scaleFactor?: number;
}

const FabricCanvas: React.FC<FabricCanvasProps> = ({
  panel,
  onPanelUpdate,
  logoOverlayPath,
  panelMaskPath,
  cutlineGuidePath,
  showCutlineGuides,
  scaleFactor = 0.3, // Scale to fit in editor (30% of original size)
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyStepRef = useRef<number>(-1);
  const isUpdatingFromCanvasRef = useRef<boolean>(false); // Flag to prevent circular updates
  const syncToPanelRef = useRef<() => void>(() => {}); // Ref to latest syncToPanel for cleanup
  
  // Track previous props for diffing
  const prevPanelRef = useRef<Panel>(panel);
  const prevShowCutlineGuidesRef = useRef<boolean>(showCutlineGuides);
  const prevLogoOverlayPathRef = useRef<string | null>(logoOverlayPath);
  const isInitialLoadRef = useRef<boolean>(true);
  const isLoadingContentRef = useRef<boolean>(false); // Guard against concurrent loadContent calls
  
  // Track content hashes to detect actual data changes (not just object reference changes)
  // Include position/size so we can detect when ONLY those changed (from canvas interaction)
  const getContentHash = (p: Panel) => {
    return JSON.stringify({
      bgImage: p.backgroundImage?.image?.substring(0, 100),
      bgColor: p.backgroundColor,
      genImage: p.generatedImage?.substring(0, 100),
      logo: p.logo?.image?.substring(0, 100),
      logoOverlay: p.logoOverlay
    });
  };
  // Separate hash for position/size to detect canvas-only changes
  const getPositionHash = (p: Panel) => {
    return JSON.stringify({
      bgX: p.backgroundImage?.x,
      bgY: p.backgroundImage?.y,
      bgW: p.backgroundImage?.width,
      bgH: p.backgroundImage?.height,
      logoX: p.logo?.x,
      logoY: p.logo?.y,
      logoW: p.logo?.width,
      logoH: p.logo?.height
    });
  };
  const prevContentHashRef = useRef<string>('');
  const prevPositionHashRef = useRef<string>('');

  // Calculate scaled dimensions
  const scaledWidth = Math.round(panel.width * scaleFactor);
  const scaledHeight = Math.round(panel.height * scaleFactor);

  // Extended canvas for dragging outside bounds
  const extendedWidth = Math.round(scaledWidth * 1.4);
  const extendedHeight = Math.round(scaledHeight * 1.4);

  // Offsets
  const offsetX = (extendedWidth - scaledWidth) / 2;
  const offsetY = (extendedHeight - scaledHeight) / 2;

  console.log('🎨 Canvas dimensions:', {
    panelWidth: panel.width,
    panelHeight: panel.height,
    scaleFactor,
    scaledWidth,
    scaledHeight,
    extendedWidth,
    extendedHeight
  });

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    console.log('🎨 INITIALIZING FabricCanvas for Panel ID:', panel.id, 'Panel Name:', panel.name);

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: extendedWidth,
      height: extendedHeight,
      backgroundColor: 'transparent', // Transparent so extended area is invisible
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: true,
      enableRetinaScaling: true,
      // Performance optimizations
      skipTargetFind: false,
      perPixelTargetFind: true,
    });

    fabricCanvasRef.current = canvas;

    // Setup keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if target is body or canvas (not input fields)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const activeObject = canvas.getActiveObject();

      // Delete key (also support Backspace on Mac)
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeObject) {
        e.preventDefault();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objName = (activeObject as any).name;
        console.log('Delete key pressed, object name:', objName);

        if (objName === 'logo') {
          console.log('Removing logo');
          onPanelUpdate({ logo: undefined });
          canvas.remove(activeObject);
          canvas.discardActiveObject();
          canvas.renderAll();
          saveHistory();
        } else if (objName === 'background') {
          console.log('Removing background');
          onPanelUpdate({
            backgroundImage: undefined,
            generatedImage: undefined
          });
          canvas.remove(activeObject);
          canvas.discardActiveObject();
          canvas.renderAll();
          saveHistory();
        } else {
          console.log('Object is not logo or background, name:', objName);
        }
      }

      // Ctrl+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z or Ctrl+Y for redo
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Track object modifications for undo/redo
    // Sync when user finishes dragging/resizing
    canvas.on('object:modified', () => {
      saveHistory();
      syncToPanelRef.current();
    });

    // Throttled sync during movement - captures state periodically during drag
    // This ensures changes are saved even if user switches panels mid-drag
    let lastSyncTime = 0;
    const throttleMs = 100; // Sync at most every 100ms during drag

    canvas.on('object:moving', () => {
      const now = Date.now();
      if (now - lastSyncTime > throttleMs) {
        lastSyncTime = now;
        syncToPanelRef.current();
      }
    });

    canvas.on('object:scaling', () => {
      const now = Date.now();
      if (now - lastSyncTime > throttleMs) {
        lastSyncTime = now;
        syncToPanelRef.current();
      }
    });

    // Selection change - hide border when nothing selected
    canvas.on('selection:cleared', () => {
      canvas.renderAll();
    });

    canvas.on('selection:created', () => {
      canvas.renderAll();
    });

    // Initial history save
    saveHistory();

    return () => {
      // Sync state before unmounting to preserve any pending changes
      syncToPanelRef.current();
      window.removeEventListener('keydown', handleKeyDown);
      canvas.dispose();
    };
  }, []);

  // Save canvas state to history
  const saveHistory = () => {
    if (!fabricCanvasRef.current) return;

    const json = JSON.stringify(fabricCanvasRef.current.toJSON());
    historyStepRef.current++;
    historyRef.current = historyRef.current.slice(0, historyStepRef.current);
    historyRef.current.push(json);

    // Limit history to 50 steps
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyStepRef.current--;
    }
  };

  // Undo function
  const undo = () => {
    if (!fabricCanvasRef.current || historyStepRef.current <= 0) return;

    historyStepRef.current--;
    const state = historyRef.current[historyStepRef.current];

    console.log('Undoing to step:', historyStepRef.current);

    fabricCanvasRef.current.loadFromJSON(JSON.parse(state)).then(() => {
      fabricCanvasRef.current?.renderAll();
      // Don't sync to panel on undo - it will cause reload
    });
  };

  // Redo function
  const redo = () => {
    if (!fabricCanvasRef.current || historyStepRef.current >= historyRef.current.length - 1) return;

    historyStepRef.current++;
    const state = historyRef.current[historyStepRef.current];

    console.log('Redoing to step:', historyStepRef.current);

    fabricCanvasRef.current.loadFromJSON(JSON.parse(state)).then(() => {
      fabricCanvasRef.current?.renderAll();
      // Don't sync to panel on redo - it will cause reload
    });
  };

  // Sync Fabric.js objects back to panel state
  const syncToPanel = useCallback(() => {
    if (!fabricCanvasRef.current) return;

    // Set flag to prevent canvas reload from triggered update
    isUpdatingFromCanvasRef.current = true;

    const canvas = fabricCanvasRef.current;
    const objects = canvas.getObjects();

    console.log('🔄 Syncing panel state for Panel ID:', panel.id, 'Panel Name:', panel.name);

    objects.forEach(obj => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const objName = (obj as any).name;
      if (objName === 'logo' && obj.type === 'image') {
        const imgObj = obj as fabric.Image;
        // Subtract offset to get position relative to panel bounds, then scale back to original
        const x = ((imgObj.left || 0) - offsetX) / scaleFactor;
        const y = ((imgObj.top || 0) - offsetY) / scaleFactor;
        const width = (imgObj.getScaledWidth() || 0) / scaleFactor;
        const height = (imgObj.getScaledHeight() || 0) / scaleFactor;

        // Only update if we have a valid logo image
        if (panel.logo?.image) {
          onPanelUpdate({
            logo: {
              image: panel.logo.image,
              x,
              y,
              width,
              height,
            }
          }, panel.id);
        }
      } else if (objName === 'background' && obj.type === 'image') {
        const imgObj = obj as fabric.Image;
        const x = ((imgObj.left || 0) - offsetX) / scaleFactor;
        const y = ((imgObj.top || 0) - offsetY) / scaleFactor;
        const width = (imgObj.getScaledWidth() || 0) / scaleFactor;
        const height = (imgObj.getScaledHeight() || 0) / scaleFactor;

        const bgImage = panel.backgroundImage?.image || panel.generatedImage;
        if (bgImage) {
          onPanelUpdate({
            backgroundImage: {
              image: bgImage,
              x,
              y,
              width,
              height,
            }
          }, panel.id);
        }
      }
    });

    // Clear flag after a delay to allow React effects to process
    setTimeout(() => {
      isUpdatingFromCanvasRef.current = false;
    }, 300);
  }, [panel.id, panel.logo, panel.backgroundImage, panel.generatedImage, scaleFactor, scaledWidth, scaledHeight, extendedWidth, extendedHeight, onPanelUpdate, offsetX, offsetY]);

  // Keep ref updated with latest syncToPanel for use in cleanup
  syncToPanelRef.current = syncToPanel;

  // Helper: Ensure border is on top
  const ensureBorderOnTop = (canvas: fabric.Canvas) => {
    const border = canvas.getObjects().find(obj => (obj as fabric.Object & { name?: string }).name === 'panelBorder');
    if (border) {
      canvas.bringObjectToFront(border);
    }
  };

  // Helper: Load Content (Full Reload)
  const loadContent = useCallback(() => {
    if (!fabricCanvasRef.current) return;

    // Prevent concurrent loads which cause duplicate objects
    if (isLoadingContentRef.current) {
      console.log('⏳ loadContent already in progress, skipping');
      return;
    }
    isLoadingContentRef.current = true;

    const canvas = fabricCanvasRef.current;
    canvas.clear();
    canvas.backgroundColor = 'transparent';

    // Create clipping path
    const clipRect = new fabric.Rect({
      left: offsetX,
      top: offsetY,
      width: scaledWidth,
      height: scaledHeight,
      absolutePositioned: true,
    });

    // Panel Background
    const panelBackground = new fabric.Rect({
      left: offsetX,
      top: offsetY,
      width: scaledWidth,
      height: scaledHeight,
      fill: panel.backgroundColor || '#ffffff',
      selectable: false,
      evented: false,
      name: 'panelBackground',
    });
    canvas.add(panelBackground);

    // Background Image
    const bgImageSrc = panel.backgroundImage?.image || panel.generatedImage;
    if (bgImageSrc) {
      console.log('🎨 FabricCanvas: Loading background image...', { src: bgImageSrc.substring(0, 50) + '...' });
      fabric.Image.fromURL(bgImageSrc, { crossOrigin: 'anonymous' }).then((img) => {
        if (!fabricCanvasRef.current) return;

        // Check if a background already exists on canvas to prevent duplicates
        const existingBg = canvas.getObjects().find(obj => (obj as fabric.Object & { name?: string }).name === 'background');
        if (existingBg) {
          console.log('⚠️ Background already exists on canvas, skipping duplicate');
          return;
        }

        if (!img.width || !img.height) {
          console.error('❌ FabricCanvas: Background image loaded but has invalid dimensions', img);
          return;
        }

        if (panel.backgroundImage) {
          // Restore saved position with UNIFORM scaling to prevent stretching
          // Use the larger scale factor to maintain aspect ratio (cover behavior)
          const savedScaleX = (panel.backgroundImage.width / (img.width || 1)) * scaleFactor;
          const savedScaleY = (panel.backgroundImage.height / (img.height || 1)) * scaleFactor;
          // Use uniform scale - take the larger to ensure coverage
          const uniformScale = Math.max(savedScaleX, savedScaleY);

          img.set({
            left: offsetX + panel.backgroundImage.x * scaleFactor,
            top: offsetY + panel.backgroundImage.y * scaleFactor,
            scaleX: uniformScale,
            scaleY: uniformScale,
          });
        } else {
          // Maintain aspect ratio - scale to fit within panel bounds (cover)
          const imgAspect = (img.width || 1) / (img.height || 1);
          const panelAspect = scaledWidth / scaledHeight;

          let scale: number;
          if (imgAspect > panelAspect) {
            // Image is wider - fit to height, crop width
            scale = scaledHeight / (img.height || 1);
          } else {
            // Image is taller - fit to width, crop height
            scale = scaledWidth / (img.width || 1);
          }

          // Center the image within the panel
          const scaledImgWidth = (img.width || 1) * scale;
          const scaledImgHeight = (img.height || 1) * scale;
          const centerX = offsetX + (scaledWidth - scaledImgWidth) / 2;
          const centerY = offsetY + (scaledHeight - scaledImgHeight) / 2;

          img.set({
            left: centerX,
            top: centerY,
            scaleX: scale,
            scaleY: scale,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (img as any).name = 'background';
        img.set({
          selectable: true,
          hasControls: true,
          hasBorders: true,
          cornerSize: 12,
          cornerColor: '#3b82f6',
          cornerStyle: 'circle',
          borderColor: '#3b82f6',
          transparentCorners: false,
          clipPath: clipRect,
          lockUniScaling: true, // Prevent non-uniform scaling (no stretching)
        });

        canvas.add(img);
        canvas.sendObjectToBack(img);
        canvas.sendObjectToBack(panelBackground);
        ensureBorderOnTop(canvas);
        canvas.renderAll();
        console.log('✅ FabricCanvas: Background image loaded and rendered');
        console.log('🎨 Canvas element dimensions:', {
          width: canvasRef.current?.width,
          height: canvasRef.current?.height,
          style: canvasRef.current?.style.width + ' x ' + canvasRef.current?.style.height
        });
      }).catch(err => {
        console.error('❌ FabricCanvas: Failed to load background image', err);
      });
    }

    // Logo
    if (panel.logo?.image) {
      console.log('🎨 FabricCanvas: Loading logo image...', { imageLength: panel.logo.image.length });
      fabric.Image.fromURL(panel.logo.image, { crossOrigin: 'anonymous' }).then((img) => {
        if (!fabricCanvasRef.current) return;

        // Check if a logo already exists on canvas to prevent duplicates
        const existingLogo = canvas.getObjects().find(obj => (obj as fabric.Object & { name?: string }).name === 'logo');
        if (existingLogo) {
          console.log('⚠️ Logo already exists on canvas, skipping duplicate');
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (img as any).name = 'logo';

        // Check if image loaded correctly
        if (!img.width || !img.height) {
          console.error('❌ FabricCanvas: Logo image loaded but has invalid dimensions', img);
          return;
        }

        const scale = Math.min(
          (panel.logo!.width / (img.width || 1)) * scaleFactor,
          (panel.logo!.height / (img.height || 1)) * scaleFactor
        );

        console.log('🎨 FabricCanvas: Logo loaded', {
          originalSize: `${img.width}x${img.height}`,
          scale,
          targetPos: `${panel.logo!.x}x${panel.logo!.y}`
        });

        img.set({
          left: offsetX + panel.logo!.x * scaleFactor,
          top: offsetY + panel.logo!.y * scaleFactor,
          scaleX: scale,
          scaleY: scale,
          selectable: true,
          hasControls: true,
          hasBorders: true,
          cornerSize: 12,
          cornerColor: '#9ca3af',
          cornerStyle: 'circle',
          borderColor: '#9ca3af',
          transparentCorners: false,
          lockScalingFlip: true,
          lockUniScaling: false,
          clipPath: clipRect,
        });

        canvas.add(img);
        ensureBorderOnTop(canvas);
        canvas.renderAll();
      }).catch(err => {
        console.error('❌ FabricCanvas: Failed to load logo image', err);
      });
    }

    // Logo Overlay
    if (panel.logoOverlay?.enabled && logoOverlayPath) {
      fabric.Image.fromURL(logoOverlayPath, { crossOrigin: 'anonymous' }).then((img) => {
        if (!fabricCanvasRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (img as any).name = 'logoOverlay';
        img.set({
          left: offsetX,
          top: offsetY,
          scaleX: scaledWidth / (img.width || 1),
          scaleY: scaledHeight / (img.height || 1),
          selectable: false,
          evented: false,
        });
        canvas.add(img);
        ensureBorderOnTop(canvas);
        canvas.renderAll();
      }).catch(err => {
        console.error('❌ FabricCanvas: Failed to load logo overlay', err);
      });
    }

    // Panel Mask
    if (panelMaskPath) {
      fabric.Image.fromURL(panelMaskPath, { crossOrigin: 'anonymous' }).then((img) => {
        if (!fabricCanvasRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (img as any).name = 'panelMask';
        img.set({
          left: offsetX,
          top: offsetY,
          scaleX: scaledWidth / (img.width || 1),
          scaleY: scaledHeight / (img.height || 1),
          selectable: false,
          evented: false,
        });
        canvas.add(img);
        ensureBorderOnTop(canvas);
        canvas.renderAll();
      }).catch(err => {
        console.error('❌ FabricCanvas: Failed to load panel mask', err);
      });
    }

    // Cutline Guide
    if (showCutlineGuides && cutlineGuidePath) {
      const cacheBustedPath = `${cutlineGuidePath}?v=2`;
      fabric.Image.fromURL(cacheBustedPath, { crossOrigin: 'anonymous' }).then((img) => {
        if (!fabricCanvasRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (img as any).name = 'cutlineGuide';
        img.set({
          left: offsetX,
          top: offsetY,
          scaleX: scaledWidth / (img.width || 1),
          scaleY: scaledHeight / (img.height || 1),
          selectable: false,
          evented: false,
        });
        canvas.add(img);
        ensureBorderOnTop(canvas);
        canvas.renderAll();
      }).catch(err => {
        console.error('❌ FabricCanvas: Failed to load cutline guide', err);
      });
    }

    // Panel Border
    const panelBorder = new fabric.Rect({
      left: offsetX,
      top: offsetY,
      width: scaledWidth,
      height: scaledHeight,
      fill: 'transparent',
      stroke: '#ca8a04',
      strokeWidth: 3,
      selectable: false,
      evented: false,
      name: 'panelBorder',
    });
    canvas.add(panelBorder);
    canvas.bringObjectToFront(panelBorder);
    canvas.renderAll();

    // Release loading lock after a short delay to allow async checks to complete
    setTimeout(() => {
      isLoadingContentRef.current = false;
    }, 100);

  }, [panel, logoOverlayPath, panelMaskPath, cutlineGuidePath, showCutlineGuides, scaleFactor, scaledWidth, scaledHeight, offsetX, offsetY]);

  // Main Effect for handling updates
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;

    // Calculate content hash to detect actual data changes (image data, colors)
    const currentContentHash = getContentHash(panel);
    const contentActuallyChanged = currentContentHash !== prevContentHashRef.current;

    // Calculate position hash to detect position/size only changes (from canvas interaction)
    const currentPositionHash = getPositionHash(panel);
    const positionOnlyChanged = currentPositionHash !== prevPositionHashRef.current && !contentActuallyChanged;

    // Check if this is the initial load
    if (isInitialLoadRef.current) {
      console.log('Initial canvas load - forcing content load');
      console.log('📋 Initial panel data:', {
        hasBackgroundImage: !!panel.backgroundImage?.image,
        hasLogo: !!panel.logo?.image,
        backgroundColor: panel.backgroundColor,
        panelName: panel.name
      });
      loadContent();
      isInitialLoadRef.current = false;

      // Update refs
      prevPanelRef.current = panel;
      prevShowCutlineGuidesRef.current = showCutlineGuides;
      prevLogoOverlayPathRef.current = logoOverlayPath;
      prevContentHashRef.current = currentContentHash;
      prevPositionHashRef.current = currentPositionHash;
      return;
    }

    const prevPanel = prevPanelRef.current;

    // Check what changed
    const panelIdChanged = panel.id !== prevPanel.id;
    const cutlineGuidesChanged = showCutlineGuides !== prevShowCutlineGuidesRef.current;
    const backgroundChanged = panel.backgroundColor !== prevPanel.backgroundColor ||
                              panel.backgroundImage !== prevPanel.backgroundImage ||
                              panel.generatedImage !== prevPanel.generatedImage;
    const logoChanged = panel.logo !== prevPanel.logo;
    const logoOverlayChanged = panel.logoOverlay !== prevPanel.logoOverlay || logoOverlayPath !== prevLogoOverlayPathRef.current;
    const updatingFromCanvas = isUpdatingFromCanvasRef.current;

    // Update refs
    prevPanelRef.current = panel;
    prevShowCutlineGuidesRef.current = showCutlineGuides;
    prevLogoOverlayPathRef.current = logoOverlayPath;
    prevContentHashRef.current = currentContentHash;
    prevPositionHashRef.current = currentPositionHash;

    // 1. Panel ID Changed OR Initial Load -> Full Reload
    if (panelIdChanged) {
      console.log('Switching panels - forcing canvas reload');
      loadContent();
      return;
    }

    // 2. Update from Canvas interaction -> Skip
    if (updatingFromCanvas) {
       return;
    }

    // 3. Cutline Guides Toggle -> Efficient Update
    if (cutlineGuidesChanged && !panelIdChanged && !backgroundChanged && !logoChanged) {
      console.log('Toggling cutline guides');
      const guides = canvas.getObjects().find(obj => (obj as fabric.Object & { name?: string }).name === 'cutlineGuide');
      
      if (showCutlineGuides) {
         if (!guides && cutlineGuidePath) {
             // Need to add it
             const cacheBustedPath = `${cutlineGuidePath}?v=2`;
             fabric.Image.fromURL(cacheBustedPath, { crossOrigin: 'anonymous' }).then((img) => {
               if (!fabricCanvasRef.current) return;
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               (img as any).name = 'cutlineGuide';
               img.set({
                 left: offsetX,
                 top: offsetY,
                 scaleX: scaledWidth / (img.width || 1),
                 scaleY: scaledHeight / (img.height || 1),
                 selectable: false,
                 evented: false,
               });
               canvas.add(img);
               ensureBorderOnTop(canvas);
               canvas.renderAll();
             }).catch(err => {
               console.error('❌ FabricCanvas: Failed to toggle ON cutline guide', err);
             });
         } else if (guides) {
             guides.visible = true;
             canvas.renderAll();
         }
      } else {
         if (guides) {
             guides.visible = false;
             canvas.renderAll();
         }
      }
      return;
    }

    // 4. Position-only change detection - skip reload if only position/size changed
    // This happens when user drags/resizes on canvas - no need to reload
    if (positionOnlyChanged && (backgroundChanged || logoChanged)) {
      console.log('Position/size only changed - skipping canvas reload (state saved)', {
        positionOnlyChanged,
        backgroundChanged,
        logoChanged
      });
      return;
    }

    // 5. Content changed detection using hash comparison
    // This catches cases where panel objects are different references but same/different content
    if (contentActuallyChanged || logoOverlayChanged) {
       console.log('Content changed - reloading', {
         contentActuallyChanged,
         logoOverlayChanged,
         hasNewBackgroundImage: !!panel.backgroundImage?.image,
         hasNewLogo: !!panel.logo?.image
       });
       loadContent();
    }

  }, [panel, logoOverlayPath, panelMaskPath, cutlineGuidePath, showCutlineGuides, loadContent, scaledWidth, scaledHeight, offsetX, offsetY]);

  // Safety effect: Force reload if panel has content but canvas appears empty
  // This handles race conditions where canvas initializes before panel data arrives
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    
    const hasContent = !!(panel.backgroundImage?.image || panel.logo?.image || panel.generatedImage || panel.backgroundColor);
    const canvasObjects = fabricCanvasRef.current.getObjects();
    // Canvas is "empty" if it only has panelBackground and panelBorder (2 objects)
    const canvasIsEmpty = canvasObjects.length <= 2;
    
    if (hasContent && canvasIsEmpty && !isInitialLoadRef.current) {
      console.log('🔄 Safety reload: Panel has content but canvas is empty, forcing reload');
      loadContent();
    }
  }, [panel.backgroundImage, panel.logo, panel.generatedImage, panel.backgroundColor, loadContent]);

  return (
    <div className="flex flex-col items-center" tabIndex={0} style={{ outline: 'none' }}>
      <div className="mb-2 text-xs text-gray-400">
        <kbd className="px-2 py-1 bg-gray-700 rounded">Delete/Backspace</kbd> to remove •
        <kbd className="px-2 py-1 bg-gray-700 rounded ml-2">Ctrl+Z</kbd> to undo •
        <kbd className="px-2 py-1 bg-gray-700 rounded ml-2">Ctrl+Shift+Z</kbd> to redo
      </div>
      {/* fabric-canvas-wrapper allows CSS to target Fabric.js auto-created canvas-container */}
      <div 
        className="fabric-canvas-wrapper"
        style={{
          width: `${extendedWidth}px`,
          height: `${extendedHeight}px`,
          position: 'relative',
        }}
      >
        <canvas
          ref={canvasRef}
          className="border-2 border-gray-700 rounded"
          tabIndex={-1}
          style={{
            outline: 'none',
            display: 'block',
            width: `${extendedWidth}px`,
            height: `${extendedHeight}px`
          }}
        />
      </div>
      <div className="mt-2 text-xs text-gray-400">
        Drag any corner to resize • Click outside to deselect
      </div>
    </div>
  );
};

export default FabricCanvas;
