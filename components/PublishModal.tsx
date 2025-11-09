'use client';

import { useState } from 'react';
import { publishScene } from '@/lib/firebase/publishedScenes';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneData: {
    texture: string | null;
    backgroundColor: string;
    backgroundImage: string | null;
    numberOfUnits: number;
    sceneRotation: { x: number; y: number; z: number };
    scenePosition: { x: number; y: number; z: number };
  };
  userId: string;
  userEmail: string;
  onPublished?: (sceneId: string) => void;
}

export default function PublishModal({
  isOpen,
  onClose,
  sceneData,
  userId,
  userEmail,
  onPublished
}: PublishModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');

  if (!isOpen) return null;

  const handlePublish = async () => {
    console.log('Publishing scene with data:', sceneData);
    console.log('Texture being saved:', sceneData.texture);

    setIsPublishing(true);
    try {
      const sceneId = await publishScene(
        userId,
        userEmail,
        sceneData,
        title || 'Untitled Scene',
        description,
        isPasswordProtected ? password : undefined
      );

      const url = `${window.location.origin}/view/${sceneId}`;
      setPublishedUrl(url);

      if (onPublished) {
        onPublished(sceneId);
      }
    } catch (error) {
      console.error('Error publishing scene:', error);
      alert('Failed to publish scene. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publishedUrl);
    // Show a temporary success message
    const button = document.getElementById('copy-button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }
  };

  const handleReset = () => {
    setPublishedUrl('');
    setTitle('');
    setDescription('');
    setPassword('');
    setIsPasswordProtected(false);
    setShowPassword(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-black rounded-lg p-6 max-w-md w-full">
        <h2 className="text-white text-xl font-bold mb-4">
          {publishedUrl ? 'Scene Published!' : 'Publish Scene'}
        </h2>

        {!publishedUrl ? (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-white text-sm block mb-2">Title (optional)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Amazing 3D Scene"
                  className="w-full bg-black text-white rounded px-3 py-2 text-sm border border-white/20"
                  disabled={isPublishing}
                />
              </div>

              <div>
                <label className="text-white text-sm block mb-2">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your scene..."
                  className="w-full bg-black text-white rounded px-3 py-2 h-24 resize-none text-sm border border-white/20"
                  disabled={isPublishing}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-white text-sm mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPasswordProtected}
                    onChange={(e) => {
                      setIsPasswordProtected(e.target.checked);
                      if (!e.target.checked) {
                        setPassword('');
                        setShowPassword(false);
                      }
                    }}
                    className="w-4 h-4 rounded bg-black border-white/20 text-white focus:ring-white"
                    disabled={isPublishing}
                  />
                  <span>Password protect this scene</span>
                  <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                {isPasswordProtected && (
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full bg-black text-white rounded px-3 py-2 pr-10 text-sm border border-white/20"
                      disabled={isPublishing}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-black/50 rounded p-3 border border-white/20">
                <p className="text-white text-xs mb-2">Scene Preview:</p>
                <div className="text-white/70 text-xs space-y-1">
                  <div>• {sceneData.numberOfUnits} model{sceneData.numberOfUnits > 1 ? 's' : ''}</div>
                  <div>• Current texture applied</div>
                  <div>• Custom background</div>
                  {isPasswordProtected && <div>• Password protected 🔒</div>}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-black hover:bg-white hover:text-black text-white rounded transition-colors border border-white/20"
                disabled={isPublishing}
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                className="flex-1 px-4 py-2 bg-[#ff00cb] hover:bg-[#ff00cb]/80 text-white rounded transition-colors flex items-center justify-center gap-2"
                disabled={isPublishing}
              >
                {isPublishing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Publish
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="bg-green-600/20 border border-green-600 rounded p-3">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-semibold">Successfully Published!</span>
                </div>
                <p className="text-white text-sm">
                  Your scene is now live and can be viewed by anyone with the link.
                </p>
              </div>

              <div>
                <label className="text-white text-sm block mb-2">Shareable Link:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={publishedUrl}
                    readOnly
                    className="flex-1 bg-gray-700 text-white rounded px-3 py-2 text-sm"
                  />
                  <button
                    id="copy-button"
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-white hover:bg-black hover:text-white text-black rounded transition-colors text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="text-gray-400 text-xs space-y-1">
                <p>You can manage all your published scenes from the &quot;My Links&quot; button.</p>
                {password && (
                  <p className="text-yellow-500">
                    ⚠️ Remember the password: <code className="bg-black/50 px-1 rounded border border-white/20">{password}</code>
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-2 bg-black hover:bg-white hover:text-black text-white rounded transition-colors border border-white/20"
              >
                Publish Another
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}