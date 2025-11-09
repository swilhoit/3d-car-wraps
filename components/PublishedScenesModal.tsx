'use client';

import { useState, useEffect } from 'react';
import { getUserPublishedScenes, deletePublishedScene, PublishedScene } from '@/lib/firebase/publishedScenes';
import { ConfirmModal } from './CustomModal';

interface PublishedScenesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function PublishedScenesModal({
  isOpen,
  onClose,
  userId
}: PublishedScenesModalProps) {
  const [scenes, setScenes] = useState<PublishedScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; sceneId?: string }>({ isOpen: false });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      loadScenes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const loadScenes = async () => {
    setLoading(true);
    try {
      const userScenes = await getUserPublishedScenes(userId);
      setScenes(userScenes);
    } catch (error) {
      console.error('Error loading published scenes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sceneId: string) => {
    try {
      await deletePublishedScene(sceneId);
      setScenes(scenes.filter(s => s.id !== sceneId));
    } catch (error) {
      console.error('Error deleting scene:', error);
    }
  };

  const handleCopyLink = (sceneId: string) => {
    const url = `${window.location.origin}/view/${sceneId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(sceneId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (timestamp: unknown) => {
    if (!timestamp) return 'Unknown';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const date = (timestamp as any).toDate ? (timestamp as any).toDate() : new Date(timestamp as string | number);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-black rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white text-xl font-bold">My Published Scenes</h2>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : scenes.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-white/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <p className="text-white/70 text-lg mb-2">No Published Scenes</p>
                <p className="text-white/50 text-sm">Click the Publish button to share your first scene</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scenes.map((scene) => (
                  <div key={scene.id} className="bg-black/50 rounded-lg p-4 border border-white/20">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="text-white font-semibold">{scene.title}</h3>
                        {scene.description && (
                          <p className="text-white/70 text-sm mt-1">{scene.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => window.open(`/view/${scene.id}`, '_blank')}
                          className="p-2 bg-white hover:bg-black hover:text-white text-black rounded transition-colors"
                          title="View scene"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleCopyLink(scene.id)}
                          className="p-2 bg-white hover:bg-black hover:text-white text-black rounded transition-colors"
                          title="Copy link"
                        >
                          {copiedId === scene.id ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ isOpen: true, sceneId: scene.id })}
                          className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
                          title="Delete scene"
                        >
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-white/60">
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {formatDate(scene.createdAt)}
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {scene.views} views
                      </div>
                      {scene.isPasswordProtected && (
                        <div className="flex items-center gap-1 text-yellow-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Protected
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <code className="bg-black/50 px-1 rounded border border-white/20">/view/{scene.id}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-white/20">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-black hover:bg-white hover:text-black text-white border border-white/20 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false })}
        onConfirm={() => {
          if (deleteConfirm.sceneId) {
            handleDelete(deleteConfirm.sceneId);
          }
        }}
        title="Delete Published Scene"
        message="Are you sure you want to delete this published scene? The link will no longer work."
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
}