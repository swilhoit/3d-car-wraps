import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  DocumentData,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '../firebase';

export const createDocument = async (collectionName: string, data: DocumentData) => {
  return addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
};

export const getDocument = async (collectionName: string, documentId: string) => {
  const docRef = doc(db, collectionName, documentId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  } else {
    return null;
  }
};

export const getDocuments = async (
  collectionName: string,
  constraints: QueryConstraint[] = []
) => {
  const q = query(collection(db, collectionName), ...constraints);
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const updateDocument = async (
  collectionName: string,
  documentId: string,
  data: Partial<DocumentData>
) => {
  const docRef = doc(db, collectionName, documentId);
  return updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
};

export const deleteDocument = async (collectionName: string, documentId: string) => {
  const docRef = doc(db, collectionName, documentId);
  return deleteDoc(docRef);
};

export const getUserTextures = async (userId: string) => {
  return getDocuments('textures', [
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  ]);
};

export const saveTexture = async (textureData: {
  userId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  isAIGenerated?: boolean;
  metadata?: Record<string, unknown>;
}) => {
  return createDocument('textures', textureData);
};

export const deleteTexture = async (textureId: string) => {
  return deleteDocument('textures', textureId);
};

export const updateTexture = async (textureId: string, data: {
  name?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}) => {
  return updateDocument('textures', textureId, data);
};

export { where, orderBy, limit, Timestamp };