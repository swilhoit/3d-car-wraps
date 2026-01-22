import React from 'react';

type EditorMode = 'selection' | 'start-with-ai' | 'upload-custom' | 'customize-panels' | 'review-panels';

interface ModeSelectionProps {
  onModeSelect: (mode: EditorMode) => void;
  onLaunchEditor: () => void;
}

const ModeSelection: React.FC<ModeSelectionProps> = ({ onModeSelect, onLaunchEditor }) => {
  return (
    <div className="w-full h-screen flex items-center justify-center p-6 bg-black text-white">
      <div className="max-w-4xl text-center">
        <h2 className="text-3xl font-bold mb-4">Design Editor</h2>
        <p className="text-gray-400 mb-8">Choose your preferred workflow</p>

        <div className="grid md:grid-cols-2 gap-6 mb-8 max-w-2xl mx-auto">
          <div
            className="bg-gray-800 rounded-lg p-8 border-2 border-gray-600 hover:border-gray-400 hover:shadow-lg transition-all cursor-pointer"
            onClick={() => onModeSelect('start-with-ai')}
          >
            <div className="w-20 h-20 bg-gray-600 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold mb-2">Start New Design</h3>
            <p className="text-gray-400 text-sm">
              Generate with AI, upload logos, add backgrounds, and use reference images
            </p>
          </div>

          <div
            className="bg-gray-800 rounded-lg p-8 border-2 border-gray-600 hover:border-gray-400 hover:shadow-lg transition-all cursor-pointer"
            onClick={onLaunchEditor}
          >
            <div className="w-20 h-20 bg-gray-600 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a1 1 0 01-1-1V9a1 1 0 011-1h1a2 2 0 100-4H4a1 1 0 01-1-1V4a1 1 0 011-1h3a1 1 0 001-1z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold mb-2">Launch Editor</h3>
            <p className="text-gray-400 text-sm">
              Jump straight into the panel editor
            </p>
          </div>
        </div>

        <div>
          <p className="text-gray-500 text-sm mb-3">Already have a UV template?</p>
          <button
            onClick={() => onModeSelect('upload-custom')}
            className="inline-flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white text-sm rounded transition-all"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Custom UV Template
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModeSelection;
