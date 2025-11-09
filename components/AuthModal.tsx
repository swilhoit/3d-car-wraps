'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createUser, signIn } from '@/lib/firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  requireAuth?: boolean;
}

export default function AuthModal({ isOpen, onClose, requireAuth = false }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await createUser(email, password);
      } else {
        await signIn(email, password);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-[#212121] rounded-lg p-8 max-w-md w-full">
        <div className="flex justify-center mb-4">
          <Image
            src="/coco-Logo-Full-square-w.png"
            alt="Logo"
            width={240}
            height={240}
          />
        </div>
        <h2 className="text-2xl font-bold mb-6 text-center text-white">
          {isSignUp ? 'Sign Up' : 'Sign In'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-white">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[#3a3a3a] text-white focus:outline-none focus:border-white/50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-white">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[#3a3a3a] text-white focus:outline-none focus:border-white/50"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-[#212121] py-2 rounded-md hover:bg-[#3a3a3a] hover:text-white disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-white hover:underline"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

        {!requireAuth && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}