import { useReducer, useEffect, useState } from 'react';

export type EditorMode = 'selection' | 'start-with-ai' | 'upload-custom' | 'customize-panels' | 'review-panels';

export interface Panel {
  id: number;
  name: string;
  templatePath: string;
  width: number;  // Actual panel template width
  height: number; // Actual panel template height
  generatedImage?: string;
  generatedImageUrl?: string; // From Firestore restore
  backgroundColor?: string;
  logo?: {
    image: string;
    imageUrl?: string; // From Firestore restore
    x: number;
    y: number;
    width: number;
    height: number;
  };
  backgroundImage?: {
    image: string;
    imageUrl?: string; // From Firestore restore
    x: number;
    y: number;
    width: number;
    height: number;
  };
  logoOverlay?: {
    enabled: boolean;
    variant: 'black' | 'white';
  };
  referenceImage?: string; // AI reference image for generation
  referenceDescription?: string; // Description of reference image
  uploadedImage?: string; // For compatibility
  panelType?: string;
  prompt?: string;
}

export interface DesignEditorState {
  panelStates: Panel[];
  editorConfig: {
    editorMode: EditorMode;
    currentPanelIndex: number;
    selectedModel: string;
    isSidesLinked: boolean;
    isGlobalMode: boolean;
  };
  prompts: {
    prompt: string;
    globalPrompt: string;
  };
  globalSettings: {
    globalLogo?: string;
    globalBackgroundType: 'color' | 'image';
    globalBackgroundColor: string;
    globalBackgroundImage?: string;
    flagColor?: string;
    globalReferenceImage?: string;
    globalReferenceDescription?: string;
  };
  designInfo: {
    designName: string;
    clientName: string;
    createdAt: string;
    lastModified: string;
  };
  imageLibrary?: Array<{
    id: string;
    imageUrl: string;
    thumbnailUrl?: string;
    createdAt: string;
    source: 'ai-generated' | 'uploaded';
  }>;
  version: string;
}

// Base panel definitions
export const BASE_PANELS: Panel[] = [
  { id: 1, name: 'RIGHT', templatePath: '/UVTemplateFiles/PANELS/1 RIGHT.png', width: 2190, height: 1278, logoOverlay: { enabled: true, variant: 'white' } },
  { id: 2, name: 'LEFT', templatePath: '/UVTemplateFiles/PANELS/2 LEFT.png', width: 2192, height: 1247, logoOverlay: { enabled: true, variant: 'white' } },
  { id: 3, name: 'BACK', templatePath: '/UVTemplateFiles/PANELS/3 BACK.png', width: 2192, height: 1248, logoOverlay: { enabled: true, variant: 'white' } },
  { id: 4, name: 'TOP FRONT', templatePath: '/UVTemplateFiles/PANELS/4 TOP FRONT.png', width: 2192, height: 1248 },
  { id: 5, name: 'FRONT', templatePath: '/UVTemplateFiles/PANELS/5 FRONT.png', width: 2192, height: 1013 },
  { id: 6, name: 'LID', templatePath: '/UVTemplateFiles/PANELS/6 LID.png', width: 2192, height: 2175, logoOverlay: { enabled: true, variant: 'white' } },
];

interface EditorState {
  editorMode: EditorMode;
  currentPanelIndex: number;
  panelStates: Panel[];
  prompt: string;
  selectedModel: string;
  isGenerating: boolean;
  generationProgress: string;
  isDraggingLogo: boolean;
  isResizingLogo: boolean;
  isDraggingBackground: boolean;
  isResizingBackground: boolean;
  dragOffset: { x: number; y: number };
  globalPrompt: string;
  promptError: string;
  isSidesLinked: boolean;
  isCombining: boolean;
  globalLogo: string | null;
  globalBackgroundType: 'color' | 'image';
  globalBackgroundColor: string;
  globalBackgroundImage: string | null;
  globalReferenceImage: string | null;
  globalReferenceDescription: string | null;
  referenceVariationPrompts: string[];
  isGlobalMode: boolean;
  designName: string;
  clientName: string;
  showCutlineGuides: boolean;
  imageLibrary: NonNullable<DesignEditorState['imageLibrary']>;
}

const initialState: EditorState = {
  editorMode: 'selection',
  currentPanelIndex: 0,
  panelStates: BASE_PANELS,
  prompt: '',
  selectedModel: 'nano-banana',
  isGenerating: false,
  generationProgress: '',
  isDraggingLogo: false,
  isResizingLogo: false,
  isDraggingBackground: false,
  isResizingBackground: false,
  dragOffset: { x: 0, y: 0 },
  globalPrompt: '',
  promptError: '',
  isSidesLinked: true,
  isCombining: false,
  globalLogo: null,
  globalBackgroundType: 'color',
  globalBackgroundColor: '#ffffff',
  globalBackgroundImage: null,
  globalReferenceImage: null,
  globalReferenceDescription: null,
  referenceVariationPrompts: [],
  isGlobalMode: false,
  designName: '',
  clientName: '',
  showCutlineGuides: true,
  imageLibrary: [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorAction = { type: string; payload?: any };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_EDITOR_MODE':
      return { ...state, editorMode: action.payload };
    case 'SET_CURRENT_PANEL_INDEX':
      return { ...state, currentPanelIndex: action.payload };
    case 'SET_PANEL_STATES':
      return { ...state, panelStates: action.payload };
    case 'UPDATE_PANEL':
      // Update a specific panel by ID - avoids stale closure issues
      return {
        ...state,
        panelStates: state.panelStates.map(panel =>
          panel.id === action.payload.panelId
            ? { ...panel, ...action.payload.updates }
            : panel
        )
      };
    case 'UPDATE_PANELS_BY_FUNCTION':
      // Update panels using a function - gets current state
      return {
        ...state,
        panelStates: action.payload(state.panelStates)
      };
    case 'SET_PROMPT':
      return { ...state, prompt: action.payload };
    case 'SET_SELECTED_MODEL':
      return { ...state, selectedModel: action.payload };
    case 'SET_IS_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'SET_GENERATION_PROGRESS':
      return { ...state, generationProgress: action.payload };
    case 'SET_IS_DRAGGING_LOGO':
      return { ...state, isDraggingLogo: action.payload };
    case 'SET_IS_RESIZING_LOGO':
      return { ...state, isResizingLogo: action.payload };
    case 'SET_IS_DRAGGING_BACKGROUND':
      return { ...state, isDraggingBackground: action.payload };
    case 'SET_IS_RESIZING_BACKGROUND':
      return { ...state, isResizingBackground: action.payload };
    case 'SET_DRAG_OFFSET':
      return { ...state, dragOffset: action.payload };
    case 'SET_GLOBAL_PROMPT':
      return { ...state, globalPrompt: action.payload };
    case 'SET_PROMPT_ERROR':
      return { ...state, promptError: action.payload };
    case 'SET_IS_SIDES_LINKED':
      return { ...state, isSidesLinked: action.payload };
    case 'SET_IS_COMBINING':
      return { ...state, isCombining: action.payload };
    case 'SET_GLOBAL_LOGO':
      return { ...state, globalLogo: action.payload };
    case 'SET_GLOBAL_BACKGROUND_TYPE':
      return { ...state, globalBackgroundType: action.payload };
    case 'SET_GLOBAL_BACKGROUND_COLOR':
      return { ...state, globalBackgroundColor: action.payload };
    case 'SET_GLOBAL_BACKGROUND_IMAGE':
      return { ...state, globalBackgroundImage: action.payload };
    case 'SET_GLOBAL_REFERENCE_IMAGE':
      return { ...state, globalReferenceImage: action.payload };
    case 'SET_GLOBAL_REFERENCE_DESCRIPTION':
      return { ...state, globalReferenceDescription: action.payload };
    case 'SET_REFERENCE_VARIATION_PROMPTS':
      return { ...state, referenceVariationPrompts: action.payload };
    case 'SET_IS_GLOBAL_MODE':
      return { ...state, isGlobalMode: action.payload };
    case 'SET_DESIGN_NAME':
      return { ...state, designName: action.payload };
    case 'SET_CLIENT_NAME':
      return { ...state, clientName: action.payload };
    case 'TOGGLE_CUTLINE_GUIDES':
      return { ...state, showCutlineGuides: !state.showCutlineGuides };
    case 'ADD_TO_IMAGE_LIBRARY': {
      // Add a new image to the library (avoid duplicates based on imageUrl)
      const existingImage = state.imageLibrary.find(img => img.imageUrl === action.payload.imageUrl);
      if (existingImage) {
        return state; // Don't add duplicates
      }
      return {
        ...state,
        imageLibrary: [...state.imageLibrary, action.payload]
      };
    }
    case 'SET_IMAGE_LIBRARY':
      return { ...state, imageLibrary: action.payload };
    case 'RESTORE_STATE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function useUVEditorState(
  existingDesign?: { id: string; name: string; imageData: string; editorState?: DesignEditorState } | null,
  onFlagColorChange?: (color: string) => void
) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  
  // Track individual panel generation states for parallel processing
  const [panelGenerationStates, setPanelGenerationStates] = useState<{
    [panelId: number]: 'idle' | 'generating' | 'completed' | 'failed';
  }>({});

  // Restore editor state from existing design
  useEffect(() => {
    if (existingDesign?.editorState) {
      console.log('🔄 Restoring design from editor state:', existingDesign.name);
      const loadedState = existingDesign.editorState;

      // Restore panel states with Firebase URLs converted to usable format
      if (loadedState.panelStates) {
        const restoredPanels = BASE_PANELS.map((basePanel) => {
          // Find the corresponding saved panel by ID
          const savedPanel = loadedState.panelStates.find((p) => p.id === basePanel.id);

          if (!savedPanel) {
            return basePanel;
          }

          // Merge base panel with saved data
          const restoredPanel = {
            ...basePanel,
            ...savedPanel,
            // ENSURE critical properties are never undefined
            width: savedPanel.width || basePanel.width,
            height: savedPanel.height || basePanel.height,
          };

          // Restore generatedImage from Firebase Storage URL
          if (savedPanel.generatedImageUrl && !savedPanel.generatedImage) {
            restoredPanel.generatedImage = savedPanel.generatedImageUrl;
          }

          // Restore logo image from Firebase Storage URL
          if (savedPanel.logo) {
            const logoWithUrl = savedPanel.logo;
            if (logoWithUrl.imageUrl && !logoWithUrl.image) {
              restoredPanel.logo = {
                ...logoWithUrl,
                image: logoWithUrl.imageUrl
              };
            }
            
            // Validate logo dimensions and position
            if (restoredPanel.logo) {
              const logo = restoredPanel.logo;
              const hasInvalidDimensions = !logo.width || !logo.height || logo.width <= 0 || logo.height <= 0;
              const hasInvalidPosition = logo.x === undefined || logo.y === undefined || isNaN(logo.x) || isNaN(logo.y);

              if (hasInvalidDimensions || hasInvalidPosition) {
                const logoSize = Math.round(restoredPanel.width * 0.4);
                const centerX = Math.round((restoredPanel.width - logoSize) / 2);
                const centerY = Math.round((restoredPanel.height - logoSize) / 2);

                restoredPanel.logo = {
                  ...logo,
                  x: hasInvalidPosition ? centerX : logo.x,
                  y: hasInvalidPosition ? centerY : logo.y,
                  width: hasInvalidDimensions ? logoSize : logo.width,
                  height: hasInvalidDimensions ? logoSize : logo.height
                };
              }
            }
          }

          // Restore background image from Firebase Storage URL
          if (savedPanel.backgroundImage) {
            const bgWithUrl = savedPanel.backgroundImage;
            
            if (bgWithUrl.imageUrl && !bgWithUrl.image) {
              restoredPanel.backgroundImage = {
                ...bgWithUrl,
                image: bgWithUrl.imageUrl
              };
            }
            
            // BACKWARDS COMPATIBILITY check moved inside here as fallback
          } else if (restoredPanel.generatedImage) {
             // Convert old generatedImage format to backgroundImage format
             restoredPanel.backgroundImage = {
               image: restoredPanel.generatedImage,
               x: 0,
               y: 0,
               width: restoredPanel.width,
               height: restoredPanel.height
             };
             restoredPanel.generatedImage = undefined;
          }

          // Fix dimensions if needed
          if (restoredPanel.backgroundImage) {
            const bg = restoredPanel.backgroundImage;
            const needsDimensionFix = !bg.width || !bg.height || bg.width <= 0 || bg.height <= 0 || isNaN(bg.width) || isNaN(bg.height);
            const needsPositionFix = bg.x === undefined || bg.y === undefined || isNaN(bg.x) || isNaN(bg.y);

            if (needsDimensionFix || needsPositionFix) {
              restoredPanel.backgroundImage = {
                ...bg,
                x: (bg.x !== undefined && !isNaN(bg.x)) ? bg.x : 0,
                y: (bg.y !== undefined && !isNaN(bg.y)) ? bg.y : 0,
                width: (bg.width && bg.width > 0 && !isNaN(bg.width)) ? bg.width : restoredPanel.width,
                height: (bg.height && bg.height > 0 && !isNaN(bg.height)) ? bg.height : restoredPanel.height
              };
            }
          }

          return restoredPanel;
        });

        dispatch({ type: 'SET_PANEL_STATES', payload: restoredPanels });
      }

      // Restore editor configuration
      if (loadedState.editorConfig) {
        dispatch({ type: 'SET_EDITOR_MODE', payload: loadedState.editorConfig.editorMode || 'review-panels' });
        dispatch({ type: 'SET_CURRENT_PANEL_INDEX', payload: loadedState.editorConfig.currentPanelIndex || 0 });
        dispatch({ type: 'SET_SELECTED_MODEL', payload: loadedState.editorConfig.selectedModel || 'nano-banana' });
        dispatch({ type: 'SET_IS_SIDES_LINKED', payload: loadedState.editorConfig.isSidesLinked ?? true });
        dispatch({ type: 'SET_IS_GLOBAL_MODE', payload: loadedState.editorConfig.isGlobalMode || false });
      }

      // Restore prompts
      if (loadedState.prompts) {
        dispatch({ type: 'SET_PROMPT', payload: loadedState.prompts.prompt || '' });
        dispatch({ type: 'SET_GLOBAL_PROMPT', payload: loadedState.prompts.globalPrompt || '' });
      }

      // Restore global settings
      if (loadedState.globalSettings) {
        dispatch({ type: 'SET_GLOBAL_LOGO', payload: loadedState.globalSettings.globalLogo || null });
        dispatch({ type: 'SET_GLOBAL_BACKGROUND_TYPE', payload: loadedState.globalSettings.globalBackgroundType || 'color' });
        dispatch({ type: 'SET_GLOBAL_BACKGROUND_COLOR', payload: loadedState.globalSettings.globalBackgroundColor || '#ffffff' });
        dispatch({ type: 'SET_GLOBAL_BACKGROUND_IMAGE', payload: loadedState.globalSettings.globalBackgroundImage || null });
        if (loadedState.globalSettings.flagColor && onFlagColorChange) {
           onFlagColorChange(loadedState.globalSettings.flagColor);
        }
      }

      // Restore design info
      if (loadedState.designInfo) {
        dispatch({ type: 'SET_DESIGN_NAME', payload: loadedState.designInfo.designName || existingDesign.name || '' });
        dispatch({ type: 'SET_CLIENT_NAME', payload: loadedState.designInfo.clientName || '' });
      }

      // Restore image library
      if (loadedState.imageLibrary) {
        dispatch({ type: 'SET_IMAGE_LIBRARY', payload: loadedState.imageLibrary || [] });
      }
    }
  }, [existingDesign, onFlagColorChange]);

  const isPanelCompleted = (panel: Panel) => {
    return !!(panel.backgroundColor || panel.backgroundImage);
  };

  return {
    state,
    dispatch,
    panelGenerationStates,
    setPanelGenerationStates,
    isPanelCompleted,
    currentPanel: state.panelStates[state.currentPanelIndex],
  };
}

