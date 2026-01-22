import {
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata
} from 'firebase/storage';
import { storage } from '../firebase';

export const uploadFile = async (
  path: string,
  file: File | Blob,
  metadata?: { [key: string]: string }
) => {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file, metadata ? { customMetadata: metadata } : undefined);
  return getDownloadURL(snapshot.ref);
};

export const uploadBase64 = async (
  path: string,
  base64String: string,
  metadata?: { [key: string]: string }
) => {
  const storageRef = ref(storage, path);
  const snapshot = await uploadString(storageRef, base64String, 'data_url',
    metadata ? { customMetadata: metadata } : undefined);
  return getDownloadURL(snapshot.ref);
};

export const getFileURL = async (path: string) => {
  const storageRef = ref(storage, path);
  return getDownloadURL(storageRef);
};

export const deleteFile = async (path: string) => {
  const storageRef = ref(storage, path);
  return deleteObject(storageRef);
};

export const listFiles = async (path: string) => {
  const storageRef = ref(storage, path);
  const result = await listAll(storageRef);
  return {
    folders: result.prefixes.map(prefix => prefix.name),
    files: await Promise.all(
      result.items.map(async item => ({
        name: item.name,
        fullPath: item.fullPath,
        url: await getDownloadURL(item)
      }))
    )
  };
};

export const getFileMetadata = async (path: string) => {
  const storageRef = ref(storage, path);
  return getMetadata(storageRef);
};

export const uploadModel = async (userId: string, modelFile: File) => {
  const timestamp = Date.now();
  const path = `models/${userId}/${timestamp}_${modelFile.name}`;
  return uploadFile(path, modelFile, {
    userId,
    uploadTime: timestamp.toString(),
    originalName: modelFile.name
  });
};

export const uploadTexture = async (userId: string, textureFile: File | Blob, textureName: string = 'texture.png') => {
  const timestamp = Date.now();
  const path = `textures/${userId}/${timestamp}_${textureName}`;
  return uploadFile(path, textureFile, {
    userId,
    uploadTime: timestamp.toString(),
    originalName: textureName
  });
};

export const uploadSnapshot = async (userId: string, snapshotBlob: Blob, snapshotName: string = 'snapshot.png') => {
  const timestamp = Date.now();
  const path = `snapshots/${userId}/${timestamp}_${snapshotName}`;
  return uploadFile(path, snapshotBlob, {
    userId,
    uploadTime: timestamp.toString(),
    originalName: snapshotName
  });
};

export const uploadEditorState = async (userId: string, editorStateJson: string, textureName: string) => {
  const timestamp = Date.now();
  const jsonFileName = `${timestamp}_${textureName}_editorState.json`;
  const path = `editorStates/${userId}/${jsonFileName}`;

  // Convert JSON string to Blob
  const blob = new Blob([editorStateJson], { type: 'application/json' });

  return uploadFile(path, blob, {
    userId,
    uploadTime: timestamp.toString(),
    originalName: jsonFileName
  });
};