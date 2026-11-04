import { TTSSentenceTiming, TTSWordTiming, TTSChunkMetadata } from '../types/tts';

export interface OfflineChunkData {
  chunkIndex: number;
  hash: string;
  durationMs: number;
  audioBlob: Blob;
  sentences: TTSSentenceTiming[];
  words: TTSWordTiming[];
}

export interface OfflineChapterRecord {
  id: string; // chapterId
  novelId: string;
  chapterNumber: number;
  title: string;
  voice: string;
  pitch: string;
  durationMs: number;
  sizeBytes: number;
  downloadedAt: number;
  audioBlob: Blob; // Consolidated single MP3 blob for continuous playback and direct export
  chunks: OfflineChunkData[];
  sentences: TTSSentenceTiming[];
  words: TTSWordTiming[];
}

const DB_NAME = 'novel_edge_tts_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_chapters';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('novelId', 'novelId', { unique: false });
        store.createIndex('chapterNumber', 'chapterNumber', { unique: false });
        store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Saves a fully synthesized offline chapter into IndexedDB.
 */
export async function saveOfflineChapter(record: OfflineChapterRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to save offline chapter'));
  });
}

/**
 * Retrieves a single offline chapter by its chapter ID.
 */
export async function getOfflineChapter(chapterId: string): Promise<OfflineChapterRecord | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(chapterId);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Failed to fetch offline chapter'));
    });
  } catch (err) {
    console.warn('Error reading offline chapter from IndexedDB:', err);
    return null;
  }
}

/**
 * Retrieves all offline chapters for a novel, sorted by chapter number.
 */
export async function getAllOfflineChapters(novelId?: string): Promise<OfflineChapterRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results: OfflineChapterRecord[] = req.result || [];
        if (novelId) {
          results = results.filter(r => r.novelId === novelId);
        }
        results.sort((a, b) => a.chapterNumber - b.chapterNumber);
        resolve(results);
      };
      req.onerror = () => reject(req.error || new Error('Failed to fetch offline chapters'));
    });
  } catch (err) {
    console.warn('Error reading all offline chapters from IndexedDB:', err);
    return [];
  }
}

/**
 * Deletes a single offline chapter from IndexedDB.
 */
export async function deleteOfflineChapter(chapterId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(chapterId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to delete offline chapter'));
  });
}

/**
 * Clears all offline chapters from IndexedDB.
 */
export async function clearAllOfflineChapters(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to clear offline chapters'));
  });
}

/**
 * Calculates total storage used by offline chapters in bytes and megabytes.
 */
export async function getOfflineStorageUsage(): Promise<{ totalBytes: number; totalMB: string; count: number }> {
  try {
    const chapters = await getAllOfflineChapters();
    let totalBytes = 0;
    for (const chap of chapters) {
      totalBytes += chap.sizeBytes || (chap.audioBlob ? chap.audioBlob.size : 0);
    }
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
    return {
      totalBytes,
      totalMB,
      count: chapters.length
    };
  } catch {
    return { totalBytes: 0, totalMB: '0.0', count: 0 };
  }
}
