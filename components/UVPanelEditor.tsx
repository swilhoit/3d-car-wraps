import React, { useRef } from 'react';
import ModeSelection from './UVPanelEditor/ModeSelection';
import StartWithAIMode from './UVPanelEditor/StartWithAIMode';
import UploadMode from './UVPanelEditor/UploadMode';
import ReviewMode from './UVPanelEditor/ReviewMode';
import { 
  useUVEditorState, 
  DesignEditorState, 
  BASE_PANELS as panels 
} from '@/hooks/useUVEditorState';
import { useUVImageGeneration } from '@/hooks/useUVImageGeneration';
import { useUVImageUpload } from '@/hooks/useUVImageUpload';
import { useUVCanvasCombination } from '@/hooks/useUVCanvasCombination';

// Panel relationships for symmetric editing
const panelRelationships = {
  sides: {
    master: 'RIGHT',
    slave: 'LEFT',
    masterIndex: 0,
    slaveIndex: 1
  }
};

// Map panel names to cutline guide overlay paths
const getCutlineGuidePath = (panelName: string): string | null => {
  const guideMap: { [key: string]: string } = {
    'RIGHT': '/Cutline Guides/RIGHT-GUIDE.png',
    'LEFT': '/Cutline Guides/LEFT-GUIDE.png',
    'BACK': '/Cutline Guides/BACK-GUIDE.png',
    'TOP FRONT': '/Cutline Guides/TOP-FRONT-GUIDE.png',
    'FRONT': '/Cutline Guides/FRONT-GUIDE.png',
    'LID': '/Cutline Guides/LID-GUIDE.png',
  };
  return guideMap[panelName] || null;
};

interface UVPanelEditorProps {
  onComplete: (data: {
    uvMapUrl: string;
    thumbnailUrl?: string;
    designName: string;
    clientName: string;
    editorState: DesignEditorState;
    flagColor?: string;
  }) => void;
  userId?: string;
  existingDesign?: {
    id: string;
    name: string;
    imageData: string;
    editorState?: DesignEditorState;
  } | null;
  flagColor?: string;
  onFlagColorChange?: (color: string) => void;
}

export default function UVPanelEditor({ onComplete, userId, existingDesign, flagColor, onFlagColorChange }: UVPanelEditorProps) {
  // Core state management
  const {
    state,
    dispatch,
    panelGenerationStates,
    setPanelGenerationStates,
    isPanelCompleted,
    currentPanel
  } = useUVEditorState(existingDesign, onFlagColorChange);

  const {
    editorMode,
    currentPanelIndex,
    panelStates,
    prompt,
    selectedModel,
    isGenerating,
    generationProgress,
    isDraggingLogo,
    isResizingLogo,
    isDraggingBackground,
    isResizingBackground,
    dragOffset,
    globalPrompt,
    promptError,
    isSidesLinked,
    isCombining,
    globalLogo,
    globalBackgroundType,
    globalBackgroundColor,
    globalBackgroundImage,
    globalReferenceImage,
    globalReferenceDescription,
    referenceVariationPrompts,
    isGlobalMode,
    designName,
    clientName,
    showCutlineGuides,
    imageLibrary,
  } = state;

  // Refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null!);
  const logoInputRef = useRef<HTMLInputElement>(null!);
  const uvUploadRef = useRef<HTMLInputElement>(null!);
  const globalLogoInputRef = useRef<HTMLInputElement>(null!);
  const globalBackgroundInputRef = useRef<HTMLInputElement>(null!);
  const referenceImageInputRef = useRef<HTMLInputElement>(null!);

  // Image generation hook
  const { generatePanelTexture } = useUVImageGeneration({
    prompt,
    selectedModel,
    isGlobalMode,
    isSidesLinked,
    panelStates,
    currentPanel,
    currentPanelIndex,
    dispatch
  });

  // Function to generate all panels using globalPrompt (for Start With AI flow)
  const generateAllPanels = async () => {
    if (!globalPrompt || !globalPrompt.trim()) {
      console.log('No global prompt to generate from');
      return;
    }

    console.log('🎨 generateAllPanels: Starting AI generation for all panels with prompt:', globalPrompt);
    dispatch({ type: 'SET_IS_GENERATING', payload: true });
    dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Generating AI backgrounds for all panels...' });

    try {
      // Generate for all panels simultaneously
      const generatePromises = panelStates.map(async (panel) => {
        // IMPORTANT: Only use referenceImage if it's a data URL (user-uploaded), never a file path (template)
        const panelRef = panel.referenceImage?.startsWith('data:') ? panel.referenceImage : null;
        const globalRef = globalReferenceImage?.startsWith('data:') ? globalReferenceImage : null;
        const safeReference = globalRef || panelRef;
        const response = await fetch('/api/generate-texture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: globalPrompt,
            baseTexture: null,
            logo: null,
            reference: safeReference,
            model: selectedModel,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`Failed to generate ${panel.name}: ${response.status} - ${errorText}`);
          return { panelId: panel.id, panelName: panel.name, imageUrl: null, error: true };
        }

        const data = await response.json();
        const imageUrl = data.imageData || data.imageUrl || `/${data.filename}`;
        return { panelId: panel.id, panelName: panel.name, imageUrl };
      });

      const results = await Promise.all(generatePromises);
      const successCount = results.filter(r => r.imageUrl && !r.error).length;
      const failCount = results.filter(r => r.error).length;

      console.log(`🎨 generateAllPanels: ${successCount} succeeded, ${failCount} failed`);

      // Apply results to panel states
      dispatch({ type: 'SET_PANEL_STATES', payload: panelStates.map((panel) => {
        const result = results.find(r => r.panelId === panel.id);
        if (result && result.imageUrl) {
          return {
            ...panel,
            backgroundImage: {
              image: result.imageUrl,
              x: 0,
              y: 0,
              width: panel.width,
              height: panel.height
            }
          };
        }
        return panel;
      })});

      // Add successful generations to library
      results.forEach(result => {
        if (result.imageUrl && !result.error) {
          dispatch({
            type: 'ADD_TO_IMAGE_LIBRARY',
            payload: {
              id: `ai-${Date.now()}-${result.panelId}`,
              imageUrl: result.imageUrl,
              thumbnailUrl: result.imageUrl,
              createdAt: new Date().toISOString(),
              source: 'ai-generated'
            }
          });
        }
      });

      if (failCount > 0) {
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Generated ${successCount} panels. ${failCount} failed.` });
      } else {
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'All panels generated successfully!' });
      }
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);

    } catch (error) {
      console.error('generateAllPanels error:', error);
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Failed to generate panels. Please try again.' });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);
    } finally {
      dispatch({ type: 'SET_IS_GENERATING', payload: false });
    }
  };

  // Image upload hook
  const {
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
  } = useUVImageUpload({
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
  });

  // Canvas combination hook
  const { combineAndFinish } = useUVCanvasCombination({
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
  });

  // Helper handlers
  const handleLaunchEditor = () => {
    dispatch({ type: 'SET_EDITOR_MODE', payload: 'review-panels' });
    if (globalPrompt) {
      dispatch({ type: 'SET_PROMPT', payload: globalPrompt });
    }
  };

  const handleGlobalBackgroundColorChange = (color: string) => {
    dispatch({ type: 'SET_GLOBAL_BACKGROUND_COLOR', payload: color });
    setTimeout(() => {
      if (globalBackgroundType === 'color') {
        const newStates = panelStates.map((panel) => ({
          ...panel,
          backgroundColor: color,
        }));
        dispatch({ type: 'SET_PANEL_STATES', payload: newStates });
      }
    }, 100);
  };

  const updatePanelBackgroundColor = (color: string) => {
    if (isGlobalMode) {
      const newStates = panelStates.map((panel) => ({
        ...panel,
        backgroundColor: color || undefined,
      }));
      dispatch({ type: 'SET_PANEL_STATES', payload: newStates });
    } else {
      dispatch({
        type: 'UPDATE_PANEL',
        payload: {
          panelId: currentPanel.id,
          updates: {
            backgroundColor: color || undefined
          }
        }
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Handled by FabricCanvas now
  };

  const handleMouseUp = () => {
    // Handled by FabricCanvas now
  };

  const handleLogoMouseDown = (e: React.MouseEvent) => {
    // Handled by FabricCanvas now
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    // Handled by FabricCanvas now
  };

  const toggleCutlineGuides = () => {
    dispatch({ type: 'TOGGLE_CUTLINE_GUIDES' });
  };

  // Render mode selection
  if (editorMode === 'selection') {
    return <ModeSelection onModeSelect={(mode) => dispatch({ type: 'SET_EDITOR_MODE', payload: mode })} onLaunchEditor={handleLaunchEditor} />;
  }

  // Render Start with AI mode
  // Note: StartWithAIMode component has its own hidden file inputs internally,
  // so we don't need to render duplicate inputs here
  if (editorMode === 'start-with-ai') {
    return (
      <StartWithAIMode
        globalPrompt={globalPrompt}
        setGlobalPrompt={(prompt) => dispatch({ type: 'SET_GLOBAL_PROMPT', payload: prompt })}
        globalLogo={globalLogo}
        globalBackgroundType={globalBackgroundType}
        setGlobalBackgroundType={(type) => dispatch({ type: 'SET_GLOBAL_BACKGROUND_TYPE', payload: type })}
        globalBackgroundColor={globalBackgroundColor}
        handleGlobalBackgroundColorChange={handleGlobalBackgroundColorChange}
        globalBackgroundImage={globalBackgroundImage}
        referenceImage={globalReferenceImage}
        uploadReferenceImage={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            const imageData = e.target?.result as string;
            dispatch({ type: 'SET_GLOBAL_REFERENCE_IMAGE', payload: imageData });
          };
          reader.readAsDataURL(file);
          event.target.value = '';
        }}
        clearReferenceImage={() => dispatch({ type: 'SET_GLOBAL_REFERENCE_IMAGE', payload: null })}
        onBack={() => dispatch({ type: 'SET_EDITOR_MODE', payload: 'selection' })}
        onContinue={handleStartWithAIContinue}
        globalLogoInputRef={globalLogoInputRef}
        globalBackgroundInputRef={globalBackgroundInputRef}
        referenceImageInputRef={referenceImageInputRef}
        uploadGlobalLogo={uploadGlobalLogo}
        uploadGlobalBackground={uploadGlobalBackground}
        selectedModel={selectedModel}
        setSelectedModel={(model) => dispatch({ type: 'SET_SELECTED_MODEL', payload: model })}
        isGenerating={isGenerating}
        generationProgress={generationProgress}
        flagColor={flagColor}
        onFlagColorChange={onFlagColorChange}
      />
    );
  }

  // Render Upload mode
  if (editorMode === 'upload-custom') {
    return (
      <>
        <UploadMode
          onBack={() => dispatch({ type: 'SET_EDITOR_MODE', payload: 'selection' })}
          uvUploadRef={uvUploadRef}
          generationProgress={generationProgress}
        />
        <input
          ref={uvUploadRef}
          type="file"
          accept="image/*"
          onChange={uploadCustomUV}
          style={{ display: 'none' }}
        />
      </>
    );
  }

  // Render Review/Edit mode
  return (
    <>
      <ReviewMode
        panelStates={panelStates}
        currentPanelIndex={currentPanelIndex}
        setCurrentPanelIndex={(index) => dispatch({ type: 'SET_CURRENT_PANEL_INDEX', payload: index })}
        isSidesLinked={isSidesLinked}
        setIsSidesLinked={(linked) => dispatch({ type: 'SET_IS_SIDES_LINKED', payload: linked })}
        isGlobalMode={isGlobalMode}
        setIsGlobalMode={(mode) => dispatch({ type: 'SET_IS_GLOBAL_MODE', payload: mode })}
        isPanelCompleted={isPanelCompleted}
        combineAndFinish={combineAndFinish}
        isGenerating={isGenerating}
        isCombining={isCombining}
        handleMouseMove={handleMouseMove}
        handleMouseUp={handleMouseUp}
        handleLogoMouseDown={handleLogoMouseDown}
        setIsResizingLogo={(resizing) => dispatch({ type: 'SET_IS_RESIZING_LOGO', payload: resizing })}
        handleBackgroundMouseDown={handleBackgroundMouseDown}
        setIsResizingBackground={(resizing) => dispatch({ type: 'SET_IS_RESIZING_BACKGROUND', payload: resizing })}
        designName={designName}
        setDesignName={(name) => dispatch({ type: 'SET_DESIGN_NAME', payload: name })}
        clientName={clientName}
        setClientName={(name) => dispatch({ type: 'SET_CLIENT_NAME', payload: name })}
        selectedModel={selectedModel}
        setSelectedModel={(model) => dispatch({ type: 'SET_SELECTED_MODEL', payload: model })}
        prompt={prompt}
        setPrompt={(prompt) => dispatch({ type: 'SET_PROMPT', payload: prompt })}
        generatePanelTexture={generatePanelTexture}
        updatePanelBackgroundColor={updatePanelBackgroundColor}
        fileInputRef={fileInputRef}
        logoInputRef={logoInputRef}
        referenceImageInputRef={referenceImageInputRef}
        uploadPanelImage={uploadPanelImage}
        uploadLogo={uploadLogo}
        uploadReferenceImage={uploadReferenceImage}
        removeReferenceImage={removeReferenceImage}
        removeLogo={removeLogo}
        clearPanel={clearPanel}
        generationProgress={generationProgress}
        setEditorMode={(mode) => dispatch({ type: 'SET_EDITOR_MODE', payload: mode })}
        globalPrompt={globalPrompt}
        dispatch={dispatch}
        showCutlineGuides={showCutlineGuides}
        toggleCutlineGuides={toggleCutlineGuides}
        getCutlineGuidePath={getCutlineGuidePath}
        flagColor={flagColor}
        onFlagColorChange={onFlagColorChange}
        imageLibrary={imageLibrary}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={uploadPanelImage}
        style={{ display: 'none' }}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        onChange={uploadLogo}
        style={{ display: 'none' }}
      />
      <input
        ref={referenceImageInputRef}
        type="file"
        accept="image/*"
        onChange={uploadReferenceImage}
        style={{ display: 'none' }}
      />
    </>
  );
}

