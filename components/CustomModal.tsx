'use client';

import { useEffect } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'confirm' | 'alert';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'confirm'
}: ConfirmModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
      <div className="bg-black rounded-lg p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-white text-lg font-semibold mb-3">{title}</h3>
        <p className="text-white mb-6">{message}</p>

        <div className="flex gap-3 justify-end">
          {type === 'confirm' && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-black hover:bg-white hover:text-black text-white rounded-lg transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-lg transition-colors ${
              type === 'confirm'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-white hover:bg-black hover:text-white text-black'
            }`}
          >
            {type === 'confirm' ? confirmText : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

export function AlertModal({
  isOpen,
  onClose,
  title = 'Notification',
  message,
  type = 'info'
}: AlertModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
      <div className="bg-black rounded-lg p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          {getIcon()}
          <div className="flex-1">
            <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
            <p className="text-white">{message}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-black hover:text-white text-black rounded-lg transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProgressModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  progress: number; // 0-100
  currentStep?: string;
  totalSteps?: number;
  completedSteps?: number;
}

export function ProgressModal({
  isOpen,
  title = 'Processing',
  message,
  progress,
  currentStep,
  totalSteps,
  completedSteps
}: ProgressModalProps) {
  console.log('🎯 PROGRESS MODAL RENDER:', { isOpen, progress, currentStep, completedSteps, totalSteps });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
      <div className="bg-black rounded-lg p-6 max-w-md w-full shadow-2xl border border-white/10">
        <div className="mb-4">
          <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
          <p className="text-white/80 text-sm">{message}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-white/60">
            <span>{Math.round(progress)}%</span>
            {totalSteps !== undefined && completedSteps !== undefined && (
              <span>{completedSteps} / {totalSteps} steps</span>
            )}
          </div>
        </div>

        {/* Current step */}
        {currentStep && (
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{currentStep}</span>
          </div>
        )}
      </div>
    </div>
  );
}