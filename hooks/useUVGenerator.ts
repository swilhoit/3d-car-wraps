import { useCallback } from 'react';
import { Panel } from './useUVEditorState';

interface UseUVGeneratorProps {
  dispatch: (action: any) => void;
  prompt: string;
  isGlobalMode: boolean;
  isSidesLinked: boolean;
  panelStates: Panel[];
  selectedModel: string;
  currentPanelIndex: number;
}

const panelRelationships = {
  sides: {
    master: 'RIGHT',
    slave: 'LEFT',
    masterIndex: 0,
    slaveIndex: 1
  }
};

export const useUVGenerator = ({
  dispatch,
  prompt,
  isGlobalMode,
  isSidesLinked,
  panelStates,
  selectedModel,
  currentPanelIndex,
}: UseUVGeneratorProps) => {

  const generatePanelTexture = useCallback(async () => {
    const currentPanel = panelStates[currentPanelIndex];

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
                image: result.imageUrl,
                x: 0,
                y: 0,
                width: panel.width,
                height: panel.height
              },
              generatedImage: result.imageUrl, // Keep for backward compatibility
              prompt: prompt
            };
          }
          
          // Also handle LEFT panel if sides are linked
          if (isSidesLinked && panel.name === 'LEFT') {
            const rightResult = results.find(r => r.panelName === 'RIGHT');
            if (rightResult && rightResult.imageUrl) {
              return {
                ...panel,
                backgroundImage: {
                  image: rightResult.imageUrl,
                  x: 0,
                  y: 0,
                  width: panel.width,
                  height: panel.height
                },
                generatedImage: rightResult.imageUrl,
                prompt: prompt
              };
            }
          }
          
          return panel;
        })});

        // Add generated images to library
        results.forEach(result => {
          if (result.imageUrl) {
            dispatch({
              type: 'ADD_TO_IMAGE_LIBRARY',
              payload: {
                id: `gen_${Date.now()}_${result.panelId}`,
                imageUrl: result.imageUrl,
                createdAt: new Date().toISOString(),
                source: 'ai-generated'
              }
            });
          }
        });

        if (failCount > 0) {
          // Check if all failures are due to the same reason
          const errorReasons = failedPanels.map(p => p.errorMessage?.split(': ')[1] || 'Unknown error');
          const uniqueReasons = [...new Set(errorReasons)];

          if (uniqueReasons.length === 1 && failCount === results.length) {
            // All panels failed with the same error
            dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Generation failed: ${uniqueReasons[0]}. Please try again.` });
          } else if (uniqueReasons.includes('Rate limit exceeded')) {
            dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Completed: ${successCount} succeeded, ${failCount} failed (rate limited). Wait and retry.` });
          } else if (uniqueReasons.includes('API quota exceeded')) {
            dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Completed: ${successCount} succeeded, ${failCount} failed (quota exceeded).` });
          } else {
            dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Completed: ${successCount} succeeded, ${failCount} failed` });
          }
        } else {
          dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'All panels generated successfully!' });
        }
        setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 7000);
      } catch (error) {
        console.error('Global generation error:', error);
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Failed to generate some panels' });
        setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);
      } finally {
        dispatch({ type: 'SET_IS_GENERATING', payload: false });
      }
      return;
    }

    // Regular single panel generation
    // Redirect LEFT panel generation to RIGHT when sides are linked
    if (currentPanel.name === 'LEFT' && isSidesLinked) {
      console.log('LEFT panel generation redirected to RIGHT panel (sides are linked)');
      dispatch({ type: 'SET_CURRENT_PANEL_INDEX', payload: panelRelationships.sides.masterIndex });
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Generating RIGHT panel (will auto-copy to LEFT)...' });
      // The function will re-run with the RIGHT panel now selected
      // Note: We can't easily re-run immediately because state update is async.
      // But setting generation progress and index will likely trigger user to click again or we rely on them clicking again?
      // Actually, the original code just returned. 
      // A better UX might be to actually call the API for the RIGHT panel here, but let's stick to original behavior for now.
      return;
    }

    console.log('Starting generation for panel:', currentPanel.name);
    dispatch({ type: 'SET_IS_GENERATING', payload: true });
    dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Generating texture for ${currentPanel.name} panel...` });

    try {
      // If there's a reference image with description, generate a variation prompt
      let finalPrompt = prompt;
      if (currentPanel.referenceImage && currentPanel.referenceDescription && prompt.trim()) {
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Creating style variation...' });

        try {
          const variationResponse = await fetch('/api/generate-single-variation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              basePrompt: prompt,
              referenceDescription: currentPanel.referenceDescription
            })
          });

          if (variationResponse.ok) {
            const variationData = await variationResponse.json();
            finalPrompt = variationData.prompt || prompt;
            console.log('Generated variation prompt:', finalPrompt);
          }
        } catch (error) {
          console.error('Failed to generate variation, using original prompt:', error);
        }

        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: `Generating texture for ${currentPanel.name} panel...` });
      }

      // Generate regular background images without panel templates
      // IMPORTANT: Only use referenceImage if it's a data URL (user-uploaded), never a file path (template)
      const safeReference = currentPanel.referenceImage?.startsWith('data:') ? currentPanel.referenceImage : null;
      console.log('Sending request to API with model:', selectedModel);
      console.log('Using prompt:', finalPrompt);
      const response = await fetch('/api/generate-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          baseTexture: null, // No longer using panel templates - generate regular backgrounds
          logo: null,
          reference: safeReference,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
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
          errorMessage = 'API quota exceeded. Please upgrade your plan.';
        } else if (response.status === 401) {
          errorMessage = 'Authentication failed. Please sign in again.';
        } else if (response.status >= 500) {
          errorMessage = 'Server error. Please try again later.';
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      const imageUrl = data.imageData || data.imageUrl || `/${data.filename}`;
      
      // Update current panel
      dispatch({
        type: 'UPDATE_PANEL',
        payload: {
          panelId: currentPanel.id,
          updates: {
            backgroundImage: {
              image: imageUrl,
              x: 0,
              y: 0,
              width: currentPanel.width,
              height: currentPanel.height
            },
            generatedImage: imageUrl,
            prompt: finalPrompt
          }
        }
      });

      // Add to image library
      dispatch({
        type: 'ADD_TO_IMAGE_LIBRARY',
        payload: {
          id: `gen_${Date.now()}`,
          imageUrl: imageUrl,
          createdAt: new Date().toISOString(),
          source: 'ai-generated'
        }
      });

      // If sides are linked and this is the master panel (RIGHT), update the slave panel (LEFT)
      if (isSidesLinked && currentPanel.name === panelRelationships.sides.master) {
        console.log('Copying generated image to LEFT panel (linked)');
        // Find the LEFT panel ID
        const leftPanel = panelStates.find(p => p.name === panelRelationships.sides.slave);
        if (leftPanel) {
           dispatch({
            type: 'UPDATE_PANEL',
            payload: {
              panelId: leftPanel.id,
              updates: {
                backgroundImage: {
                  image: imageUrl,
                  x: 0,
                  y: 0,
                  width: leftPanel.width,
                  height: leftPanel.height
                },
                generatedImage: imageUrl,
                prompt: finalPrompt
              }
            }
          });
        }
      }

      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Generation complete!' });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 2000);

    } catch (error) {
      console.error('Generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate texture';
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: errorMessage });
      // Don't clear error automatically so user can read it
    } finally {
      dispatch({ type: 'SET_IS_GENERATING', payload: false });
    }
  }, [dispatch, prompt, isGlobalMode, isSidesLinked, panelStates, selectedModel, currentPanelIndex]);

  return { generatePanelTexture };
};
