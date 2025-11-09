import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  updateDoc,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

export interface PublishedScene {
  id: string;
  userId: string;
  userEmail?: string;
  sceneData: {
    texture: string | null;
    backgroundColor: string;
    backgroundImage: string | null;
    numberOfUnits: number;
    sceneRotation: { x: number; y: number; z: number };
    scenePosition: { x: number; y: number; z: number };
  };
  title?: string;
  description?: string;
  createdAt: unknown;
  updatedAt: unknown;
  views: number;
  lastViewedAt?: unknown;
  isActive: boolean;
  isPasswordProtected?: boolean;
  passwordHash?: string;
}

// Generate a unique short ID for the published scene
function generateSceneId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Simple hash function for password (in production, use proper hashing)
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Publish a new scene
export async function publishScene(
  userId: string,
  userEmail: string,
  sceneData: PublishedScene['sceneData'],
  title?: string,
  description?: string,
  password?: string
): Promise<string> {
  console.log('[publishScene] Received sceneData:', sceneData);
  console.log('[publishScene] Texture value:', sceneData.texture);

  let sceneId = generateSceneId();

  // Check if ID already exists (very unlikely but possible)
  let exists = true;
  while (exists) {
    const docRef = doc(db, 'publishedScenes', sceneId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      exists = false;
    } else {
      sceneId = generateSceneId();
    }
  }

  const publishedScene: Omit<PublishedScene, 'id'> = {
    userId,
    userEmail,
    sceneData,
    title: title || 'Untitled Scene',
    description: description || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    views: 0,
    isActive: true,
    isPasswordProtected: !!password,
    ...(password && { passwordHash: simpleHash(password) })
  };

  console.log('[publishScene] Saving to Firestore:', publishedScene);
  console.log('[publishScene] Scene texture in final object:', publishedScene.sceneData.texture);

  await setDoc(doc(db, 'publishedScenes', sceneId), publishedScene);
  return sceneId;
}

// Get all published scenes for a user
export async function getUserPublishedScenes(userId: string): Promise<PublishedScene[]> {
  const q = query(
    collection(db, 'publishedScenes'),
    where('userId', '==', userId),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as PublishedScene));
}

// Get a single published scene by ID
export async function getPublishedScene(sceneId: string): Promise<PublishedScene | null> {
  const docRef = doc(db, 'publishedScenes', sceneId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists() && docSnap.data().isActive) {
    const sceneData = docSnap.data();
    console.log('[getPublishedScene] Raw Firestore data:', sceneData);
    console.log('[getPublishedScene] SceneData texture:', sceneData.sceneData?.texture);

    return {
      id: docSnap.id,
      ...sceneData
    } as PublishedScene;
  }

  return null;
}

// Increment view count for a published scene
export async function incrementSceneViews(sceneId: string): Promise<void> {
  try {
    const docRef = doc(db, 'publishedScenes', sceneId);
    await updateDoc(docRef, {
      views: increment(1),
      lastViewedAt: serverTimestamp()
    });
  } catch {
    // Silently fail if unable to increment views (e.g., permissions issue)
    // This is expected for unauthenticated users
  }
}

// Verify password for protected scene
export function verifyScenePassword(scene: PublishedScene, password: string): boolean {
  if (!scene.isPasswordProtected || !scene.passwordHash) {
    return true;
  }
  return scene.passwordHash === simpleHash(password);
}

// Update a published scene
export async function updatePublishedScene(
  sceneId: string,
  updates: Partial<Pick<PublishedScene, 'title' | 'description' | 'sceneData'>>
): Promise<void> {
  const docRef = doc(db, 'publishedScenes', sceneId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

// Soft delete a published scene (mark as inactive)
export async function deletePublishedScene(sceneId: string): Promise<void> {
  const docRef = doc(db, 'publishedScenes', sceneId);
  await updateDoc(docRef, {
    isActive: false,
    updatedAt: serverTimestamp()
  });
}

// Hard delete a published scene (permanent)
export async function permanentlyDeletePublishedScene(sceneId: string): Promise<void> {
  await deleteDoc(doc(db, 'publishedScenes', sceneId));
}