import { Dispatch, SetStateAction } from 'react';
import { EditorAction, Panel } from './useUVEditorState';

// Panel relationships for symmetric editing
const panelRelationships = {
  sides: {
    master: 'RIGHT',
    slave: 'LEFT',
    masterIndex: 0,
    slaveIndex: 1
  }
};

interface UseUVImageGenerationProps {
  prompt: string;
  selectedModel: string;
  isGlobalMode: boolean;
  isSidesLinked: boolean;
  panelStates: Panel[];
  currentPanel: Panel;
  currentPanelIndex: number;
  dispatch: Dispatch<EditorAction>;
}

export function useUVImageGeneration({
  prompt,
  selectedModel,
  isGlobalMode,
  isSidesLinked,
  panelStates,
  currentPanel,
  currentPanelIndex,
  dispatch
}: UseUVImageGenerationProps) {

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
            const newPanel = {
              ...panel,
              // AI-generated images are stored as backgroundImage (same as uploaded images)
              backgroundImage: {
                image: result.imageUrl,
                x: 0,
                y: 0,
                width: panel.width,
                height: panel.height
              }
            };
            
            // Add to image library
            dispatch({ 
              type: 'ADD_TO_IMAGE_LIBRARY', 
              payload: {
                id: `gen_${Date.now()}_${panel.id}`,
                imageUrl: result.imageUrl,
                thumbnailUrl: result.imageUrl,
                createdAt: new Date().toISOString(),
                source: 'ai-generated'
              }
            });
            
            return newPanel;
          }
          // Handle LEFT panel copying if sides are linked
          if (panel.name === 'LEFT' && isSidesLinked) {
            const rightResult = results.find(r => r.panelName === 'RIGHT');
            if (rightResult && rightResult.imageUrl) {
              const newPanel = {
                ...panel,
                // AI-generated images are stored as backgroundImage (same as uploaded images)
                backgroundImage: {
                  image: rightResult.imageUrl,
                  x: 0,
                  y: 0,
                  width: panel.width,
                  height: panel.height
                }
              };
              return newPanel;
            }
          }
          return panel;
        }) });

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
      // We can't easily recurse here without passing state, so we rely on the user clicking again or effect
      // Actually, since we just dispatched SET_CURRENT_PANEL_INDEX, the component will re-render. 
      // We can just stop here and let the user click again, OR we can handle it better in the UI.
      // For now, we'll just stop and let the UI update.
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
      // The panel cutouts will be applied during export
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
        const errorText = await response.text().catch(() => 'Unknown error');
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || `Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const imageUrl = data.imageData || data.imageUrl || `/${data.filename}`;

      console.log('Generation successful, image URL:', imageUrl ? imageUrl.substring(0, 50) + '...' : 'null');

      // Update panel with generated image
      const newPanel = {
        ...currentPanel,
        // AI-generated images are stored as backgroundImage
        backgroundImage: {
          image: imageUrl,
          x: 0,
          y: 0,
          width: currentPanel.width,
          height: currentPanel.height
        }
      };
      
      // Update the panel
      dispatch({
        type: 'UPDATE_PANEL',
        payload: {
          panelId: currentPanel.id,
          updates: newPanel
        }
      });
      
      // Add to image library
      dispatch({ 
        type: 'ADD_TO_IMAGE_LIBRARY', 
        payload: {
          id: `gen_${Date.now()}`,
          imageUrl: imageUrl,
          thumbnailUrl: imageUrl,
          createdAt: new Date().toISOString(),
          source: 'ai-generated'
        }
      });

      // Copy to slave panel if sides are linked
      if (isSidesLinked && currentPanel.name === panelRelationships.sides.master) {
         // This logic was in applySameImageToSlave, we can replicate it or just dispatch an update
         // We need to find the slave panel index
         const slaveIndex = panelStates.findIndex(p => p.name === panelRelationships.sides.slave);
         if (slaveIndex >= 0) {
           const slavePanel = panelStates[slaveIndex];
           dispatch({
             type: 'UPDATE_PANEL',
             payload: {
               panelId: slavePanel.id,
               updates: {
                 backgroundImage: {
                   image: imageUrl,
                   x: 0,
                   y: 0,
                   width: slavePanel.width,
                   height: slavePanel.height
                 }
               }
             }
           });
         }
      }

      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Generation complete!' });
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 3000);

    } catch (error) {
      console.error('Generation error:', error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (error as any).message || 'Failed to generate texture';
      
      if (errorMessage.includes('Rate limit')) {
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Rate limit exceeded. Please wait a moment.' });
      } else if (errorMessage.includes('quota')) {
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'API quota exceeded. Please try again later.' });
      } else {
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: 'Failed to generate. Please try again.' });
      }
      setTimeout(() => dispatch({ type: 'SET_GENERATION_PROGRESS', payload: '' }), 5000);
    } finally {
      dispatch({ type: 'SET_IS_GENERATING', payload: false });
    }
  };

  return { generatePanelTexture };
}
