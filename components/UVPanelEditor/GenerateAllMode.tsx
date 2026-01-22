import React from 'react';
import Image from 'next/image';

type Panel = {
  id: number;
  name: string;
  templatePath: string;
  width: number;  // Actual panel template width
  height: number; // Actual panel template height
  generatedImage?: string;
};

type PanelGenerationState = {
  [panelId: number]: 'idle' | 'generating' | 'completed' | 'failed';
};

interface GenerateAllModeProps {
  onBack: () => void;
  onGenerateAll: () => void;
  globalPrompt: string;
  setGlobalPrompt: (prompt: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  isGenerating: boolean;
  promptError: string;
  panelStates: Panel[];
  generationProgress: string;
  panelGenerationStates: PanelGenerationState;
}

const GenerateAllMode: React.FC<GenerateAllModeProps> = ({
  onBack,
  onGenerateAll,
  globalPrompt,
  setGlobalPrompt,
  selectedModel,
  setSelectedModel,
  isGenerating,
  promptError,
  panelStates,
  generationProgress,
  panelGenerationStates,
}) => {
  return (
    <div className="w-full h-screen overflow-y-auto p-6 bg-black text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Generate with AI</h2>
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
            ← Back to Options
          </button>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-4">Global Prompt for All Panels</h3>
          <textarea
            value={globalPrompt}
            onChange={(e) => setGlobalPrompt(e.target.value)}
            placeholder="Enter your prompt"
            className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 h-24 resize-none mb-4"
            disabled={isGenerating}
          />

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
              disabled={isGenerating}
            >
              <option value="nano-banana">nano banana pro (default)</option>
              <option value="flux-kontext">Flux Kontext MULTI-IMAGE MAX</option>
              <option value="openai-image">OPEN AI IMAGE</option>
            </select>
          </div>

          <button
            onClick={onGenerateAll}
            disabled={isGenerating || !globalPrompt.trim()}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-600 text-white font-bold py-3 px-6 rounded transition-colors"
          >
            {isGenerating ? 'Generating with AI...' : 'Generate All Panels with AI'}
          </button>

          {promptError && (
            <div className="mt-3 p-3 bg-red-900 border border-red-600 rounded text-red-200 text-sm">
              {promptError}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {panelStates.map((panel) => {
            const generationState = panelGenerationStates[panel.id] || 'idle';
            const isCurrentlyGenerating = generationState === 'generating';
            const hasCompleted = generationState === 'completed' || panel.generatedImage;
            const hasFailed = generationState === 'failed';

            return (
              <div
                key={panel.id}
                className={`bg-gray-700 rounded p-3 transition-all ${
                  hasCompleted
                    ? 'ring-2 ring-green-500'
                    : hasFailed
                    ? 'ring-2 ring-red-500'
                    : isCurrentlyGenerating
                    ? 'ring-2 ring-blue-500'
                    : isGenerating
                    ? 'ring-2 ring-gray-500 ring-opacity-30'
                    : ''
                }`}
              >
                <h4 className="text-sm font-medium mb-2 flex items-center justify-between">
                  {panel.name}
                  {hasCompleted && <span className="text-green-400 text-xs">✓</span>}
                  {hasFailed && <span className="text-red-400 text-xs">✗</span>}
                  {isCurrentlyGenerating && (
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  )}
                  {!hasCompleted && !hasFailed && !isCurrentlyGenerating && isGenerating && (
                    <div className="w-3 h-3 bg-gray-500 rounded-full opacity-50"></div>
                  )}
                </h4>
                <div className="relative w-full h-20 bg-gray-600 rounded overflow-hidden">
                  {panel.generatedImage ? (
                    <Image
                      src={panel.generatedImage}
                      alt={panel.name}
                      fill
                      className="object-cover rounded"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-500">
                      {isCurrentlyGenerating ? (
                        <div className="flex flex-col items-center">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-1"></div>
                          <span className="text-blue-400">Generating...</span>
                        </div>
                      ) : hasFailed ? (
                        <div className="flex flex-col items-center">
                          <span className="text-red-400 text-lg mb-1">✗</span>
                          <span className="text-red-400">Failed</span>
                        </div>
                      ) : isGenerating ? (
                        <div className="flex flex-col items-center">
                          <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mb-1 opacity-50"></div>
                          <span>Queued...</span>
                        </div>
                      ) : (
                        'Pending...'
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {generationProgress && (
          <div className="p-4 bg-gray-700 rounded text-center mb-6">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
            {generationProgress}
          </div>
        )}
      </div>
    </div>
  );
};

export default GenerateAllMode;
