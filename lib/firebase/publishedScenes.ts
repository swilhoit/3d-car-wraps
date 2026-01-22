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
    // Core model settings
    texture: string | null;
    backgroundColor: string;
    backgroundImage: string | null;
    numberOfUnits: number;
    sceneRotation: { x: number; y: number; z: number };
    scenePosition: { x: number; y: number; z: number };

    // Camera settings
    cameraAngle: string;
    cameraPosition: { x: number; y: number; z: number };
    cameraTarget: { x: number; y: number; z: number };

    // Animation settings
    isRotating: boolean;
    rotationSpeed: number;

    // Scene elements visibility
    showPerson: boolean;
    showGroundPlane: boolean;

    // Environment settings
    environmentPreset: string;
    environmentIntensity: number;
    backgroundIntensity: number;

    // Lighting settings
    ambientLightIntensity: number;
    ambientLightColor: string;
    directionalLightIntensity: number;
    directionalLightPosition: { x: number; y: number; z: number };
    directionalLightColor: string;
    hemisphereIntensity: number;

    // Shadow settings
    shadowsEnabled: boolean;
    shadowQuality: number;
  };
  title?: string;
  description?: string;
  thumbnail?: string;
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

// Default scene settings for backward compatibility
const DEFAULT_SCENE_SETTINGS = {
  // Camera defaults
  cameraAngle: 'front',
  cameraPosition: { x: 0, y: 3, z: 22 },
  cameraTarget: { x: 0, y: 0, z: 0 },

  // Animation defaults
  isRotating: false,
  rotationSpeed: 0.5,

  // Scene elements visibility
  showPerson: false,
  showGroundPlane: true,

  // Environment defaults
  environmentPreset: 'sunset',
  environmentIntensity: 1.5,
  backgroundIntensity: 1.5,

  // Lighting defaults
  ambientLightIntensity: 0.4,
  ambientLightColor: '#ffeedd',
  directionalLightIntensity: 1.8,
  directionalLightPosition: { x: 5, y: 15, z: 5 },
  directionalLightColor: '#fffaf0',
  hemisphereIntensity: 0.6,

  // Shadow defaults
  shadowsEnabled: true,
  shadowQuality: 4096
};

// Publish a new scene
export async function publishScene(
  userId: string,
  userEmail: string,
  sceneData: Partial<PublishedScene['sceneData']>,
  title?: string,
  description?: string,
  password?: string,
  thumbnail?: string
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

  // Merge provided scene data with defaults
  const completeSceneData = {
    ...DEFAULT_SCENE_SETTINGS,
    ...sceneData
  } as PublishedScene['sceneData'];

  const publishedScene: Omit<PublishedScene, 'id'> = {
    userId,
    userEmail,
    sceneData: completeSceneData,
    title: title || 'Untitled Scene',
    description: description || '',
    ...(thumbnail && { thumbnail }),
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