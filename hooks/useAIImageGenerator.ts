import { Dispatch } from 'react';
import { EditorAction, Panel } from './useUVEditorState';

interface UseAIImageGeneratorProps {
  dispatch: Dispatch<EditorAction>;
  panelStates: Panel[];
  currentPanelIndex: number;
  prompt: string;
  selectedModel: string;
  isGlobalMode: boolean;
  isSidesLinked: boolean;
}

export function useAIImageGenerator({
  dispatch,
  panelStates,
  currentPanelIndex,
  prompt,
  selectedModel,
  isGlobalMode,
  isSidesLinked,
}: UseAIImageGeneratorProps) {
  const generatePanelTexture = async () => {
    if (!prompt.trim()) {
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Please enter a prompt' });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);
      return;
    }

    // Handle global mode - generate for all panels
    if (isGlobalMode) {
      console.log('Starting global generation for all panels');
      dispatch({ type: 'SET_IS_GENERATING', payload: true });
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Generating textures for all panels...' });

      try {
        // Generate for all panels simultaneously
        const panelsToGenerate = isSidesLinked
          ? panelStates.filter((p: Panel) => p.name !== 'LEFT') // Skip LEFT if sides are linked
          : panelStates;

        const generatePromises = panelsToGenerate.map(async (panel: Panel) => {
          // Generate regular background images without panel templates
          // The panel cutouts will be applied during export
          // IMPORTANT: Only use referenceImage if it's a data URL (user-uploaded), never a file path (template)
          const safeReference = panel.referenceImage?.startsWith('data:') ? panel.referenceImage : null;
          const response = await fetch('/api/generate-texture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              baseTexture: null, // No longer using panel templates - generate regular backgrounds
              logo: null,
              reference: safeReference,
              model: selectedModel,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: errorText };
            }

            // Log specific error details
            let errorMessage = `${panel.name}: `;
            if (response.status === 429) {
              errorMessage += 'Rate limit exceeded';
            } else if (response.status === 402) {
              errorMessage += 'API quota exceeded';
            } else if (response.status === 401) {
              errorMessage += 'Authentication failed';
            } else if (response.status >= 500) {
              errorMessage += 'Server error';
            } else {
              errorMessage += errorData.error || `Error ${response.status}`;
            }

            console.error(`Failed to generate ${panel.name}: ${response.status} - ${errorMessage}`);
            // Continue with other panels even if one fails
            return { panelId: panel.id, panelName: panel.name, imageUrl: null, error: true, errorMessage };
          }

          const data = await response.json();
          const imageUrl = data.imageData || data.imageUrl || `/${data.filename}`;
          return { panelId: panel.id, panelName: panel.name, imageUrl: imageUrl };
        });

        const results = await Promise.all(generatePromises);

        // Count successful and failed generations
        const successCount = results.filter(r => r.imageUrl && !r.error).length;
        const failCount = results.filter(r => r.error).length;
        const failedPanels = results.filter(r => r.error);

        // Apply all results
        dispatch({ type: 'SET_PANEL_STATES', payload: panelStates.map((panel: Panel) => {
          const result = results.find(r => r.panelId === panel.id);
          if (result && result.imageUrl) {
            return {
              ...panel,
              // AI-generated images are stored as backgroundImage (same as uploaded images)
              backgroundImage: {
                image: result.imageUrl!,
                x: 0,
                y: 0,
                width: panel.width,
                height: panel.height
              },
              generatedImage: undefined // Clear legacy field
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
                thumbnailUrl: result.imageUrl, // Use same URL for thumbnail for now
                createdAt: new Date().toISOString(),
                source: 'ai-generated'
              }
            });
          }
        });

        if (failCount > 0) {
          const errorMsg = failedPanels.length === 1 
            ? `Failed to generate ${failedPanels[0].panelName}: ${failedPanels[0].errorMessage?.split(': ').pop()}`
            : `Generated ${successCount} panels. Failed: ${failedPanels.map(p => p.panelName).join(', ')}`;
            
          dispatch({ type: 'SET_GENERATION_PROGRESS', payload: errorMsg });
          // Keep error message visible longer
          setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 5000);
        } else {
          dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'All panels generated successfully!' });
          setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 2000);
        }

      } catch (error) {
        console.error('Global generation error:', error);
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Failed to generate textures. Please try again.' });
        setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);
      } finally {
        dispatch({ type: 'SET_IS_GENERATING', payload: false });
      }
      return;
    }

    // Single panel generation
    dispatch({ type: 'SET_IS_GENERATING', payload: true });
    dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Generating texture...' });

    try {
      const currentPanel = panelStates[currentPanelIndex];
      
      // Generate regular background image without panel template
      // IMPORTANT: Only use referenceImage if it's a data URL (user-uploaded), never a file path (template)
      const safeReference = currentPanel.referenceImage?.startsWith('data:') ? currentPanel.referenceImage : null;
      const response = await fetch('/api/generate-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          baseTexture: null, // No longer using panel templates - generate regular background
          logo: null,
          reference: safeReference,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        let errorMessage = 'Failed to generate texture';
        if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait a moment.';
        } else if (response.status === 402) {
          errorMessage = 'API quota exceeded. Please check your billing.';
        } else if (response.status >= 500) {
          errorMessage = 'Server error. Please try again later.';
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
        
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: errorMessage });
        setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 5000);
        return;
      }

      const data = await response.json();
      const imageUrl = data.imageData || data.imageUrl || `/${data.filename}`;

      // Update the current panel with the generated image
      const updatedPanel = {
        ...currentPanel,
        // AI-generated images are stored as backgroundImage (same as uploaded images)
        backgroundImage: {
          image: imageUrl,
          x: 0,
          y: 0,
          width: currentPanel.width,
          height: currentPanel.height
        },
        generatedImage: undefined // Clear legacy field
      };

      dispatch({
        type: 'UPDATE_PANEL',
        payload: {
          panelId: currentPanel.id,
          updates: {
            backgroundImage: updatedPanel.backgroundImage,
            generatedImage: undefined
          }
        }
      });

      // Add to library
      dispatch({
        type: 'ADD_TO_IMAGE_LIBRARY',
        payload: {
          id: `ai-${Date.now()}`,
          imageUrl: imageUrl,
          thumbnailUrl: imageUrl,
          createdAt: new Date().toISOString(),
          source: 'ai-generated'
        }
      });

      // If sides are linked and this is RIGHT panel, copy to LEFT
      if (isSidesLinked && currentPanel.name === 'RIGHT') {
        const leftPanel = panelStates.find(p => p.name === 'LEFT');
        if (leftPanel) {
          console.log('Copying generated image to LEFT panel');
          dispatch({
            type: 'UPDATE_PANEL',
            payload: {
              panelId: leftPanel.id,
              updates: {
                backgroundImage: updatedPanel.backgroundImage,
                generatedImage: undefined
              }
            }
          });
        }
      }

      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Generation complete!' });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 2000);

    } catch (error) {
      console.error('Generation error:', error);
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Failed to generate texture. Please try again.' });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);
    } finally {
      dispatch({ type: 'SET_IS_GENERATING', payload: false });
    }
  };

  return { generatePanelTexture };
}
