import { useState, useEffect, useCallback } from 'react';
import {
  OfflineChapterRecord,
  OfflineChunkData,
  getAllOfflineChapters,
  getOfflineChapter,
  saveOfflineChapter,
  deleteOfflineChapter as dbDeleteOfflineChapter,
  clearAllOfflineChapters as dbClearAllOfflineChapters,
  getOfflineStorageUsage
} from '../utils/offlineAudioStorage';
import { TTSChapterPlan, TTSChunkMetadata, TTSSentenceTiming, TTSWordTiming } from '../types/tts';

export interface ChapterLike {
  id: string;
  number?: number;
  title: string;
  content?: string[];
}

export interface OfflineDownloadProgress {
  isDownloading: boolean;
  currentChapterIndex: number;
  totalChapters: number;
  currentChapterTitle: string;
  currentBatchIndex: number;
  totalBatches: number;
  batchChapterRange: string; // e.g. "Ch. 1-10"
  percent: number; // 0 to 100
  statusText: string;
  error: string | null;
}

// Module-level Singleton State for background persistence across modals and reader view
let globalDownloadProgress: OfflineDownloadProgress = {
  isDownloading: false,
  currentChapterIndex: 0,
  totalChapters: 0,
  currentChapterTitle: '',
  currentBatchIndex: 0,
  totalBatches: 0,
  batchChapterRange: '',
  percent: 0,
  statusText: '',
  error: null
};

let activeAbortController: AbortController | null = null;
const progressListeners = new Set<(progress: OfflineDownloadProgress) => void>();

function updateGlobalDownloadProgress(
  updater: Partial<OfflineDownloadProgress> | ((prev: OfflineDownloadProgress) => OfflineDownloadProgress)
) {
  if (typeof updater === 'function') {
    globalDownloadProgress = updater(globalDownloadProgress);
  } else {
    globalDownloadProgress = { ...globalDownloadProgress, ...updater };
  }
  progressListeners.forEach(listener => {
    try {
      listener(globalDownloadProgress);
    } catch (e) {
      console.warn('Listener error:', e);
    }
  });
}

export function useOfflineAudio(novelId: string = 'novel') {
  const [offlineChapters, setOfflineChapters] = useState<OfflineChapterRecord[]>([]);
  const [storageUsage, setStorageUsage] = useState<{ totalBytes: number; totalMB: string; count: number }>({
    totalBytes: 0,
    totalMB: '0.0',
    count: 0
  });

  // Synced with singleton globalDownloadProgress
  const [downloadProgress, setDownloadProgress] = useState<OfflineDownloadProgress>(globalDownloadProgress);

  // Subscribe to singleton download events
  useEffect(() => {
    const listener = (progress: OfflineDownloadProgress) => {
      setDownloadProgress(progress);
    };
    progressListeners.add(listener);
    setDownloadProgress(globalDownloadProgress);
    return () => {
      progressListeners.delete(listener);
    };
  }, []);

  // Reload offline library from IndexedDB
  const refreshOfflineLibrary = useCallback(async () => {
    try {
      const records = await getAllOfflineChapters(novelId);
      setOfflineChapters(records);
      const usage = await getOfflineStorageUsage();
      setStorageUsage(usage);
    } catch (err) {
      console.warn('Failed to load offline audio library:', err);
    }
  }, [novelId]);

  useEffect(() => {
    refreshOfflineLibrary();
  }, [refreshOfflineLibrary]);

  // Immediately abort any active download and prevent further files
  const cancelDownload = useCallback(() => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    updateGlobalDownloadProgress({
      isDownloading: false,
      percent: 0,
      statusText: 'Download cancelled',
      error: 'Cancelled by user'
    });

    // Clear cancelled banner after 3 seconds
    setTimeout(() => {
      updateGlobalDownloadProgress(prev => {
        if (!prev.isDownloading && prev.error === 'Cancelled by user') {
          return {
            isDownloading: false,
            currentChapterIndex: 0,
            totalChapters: 0,
            currentChapterTitle: '',
            currentBatchIndex: 0,
            totalBatches: 0,
            batchChapterRange: '',
            percent: 0,
            statusText: '',
            error: null
          };
        }
        return prev;
      });
    }, 3000);
  }, []);

  // Helper: Trigger browser download for a Blob
  const triggerBrowserDownload = useCallback((blob: Blob, filename: string) => {
    try {
      if (!blob || blob.size === 0) {
        console.error('Cannot download empty audio blob');
        return;
      }
      const safeFilename = (filename.endsWith('.mp4') || filename.endsWith('.mp3')) ? filename : `${filename}.mp4`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeFilename;
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      // Keep blob alive for 60 seconds so browser completes reading large audio files
      setTimeout(() => {
        try {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {}
      }, 60000);
    } catch (err) {
      console.error('Trigger browser download failed:', err);
    }
  }, []);

  /**
   * Synthesizes and downloads a single chapter into IndexedDB and server cache.
   */
  const downloadSingleChapter = useCallback(async (
    chapter: ChapterLike,
    options: {
      voice?: string;
      pitch?: string;
      signal?: AbortSignal;
      onChunkProgress?: (completedChunks: number, totalChunks: number) => void;
    } = {}
  ): Promise<OfflineChapterRecord> => {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const voice = options.voice || 'en-US-SteffanNeural';
    const pitch = options.pitch || '+0Hz';

    // 1. Get plan
    const planRes = await fetch('/api/tts/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter, novelId, voice, pitch }),
      signal: options.signal
    });

    if (!planRes.ok) {
      throw new Error(`Failed to plan chapter audio: ${planRes.statusText}`);
    }

    const plan: TTSChapterPlan = await planRes.json();
    const chunks: OfflineChunkData[] = [];
    const audioBlobs: Blob[] = [];
    const allSentences: TTSSentenceTiming[] = [];
    const allWords: TTSWordTiming[] = [];
    let cumulativeDurationMs = 0;
    let totalSizeBytes = 0;

    for (let cIdx = 0; cIdx < plan.chunks.length; cIdx++) {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted by user', 'AbortError');
      }

      const chunkPlan = plan.chunks[cIdx];

      // Synthesize chunk
      const synthRes = await fetch('/api/tts/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk: chunkPlan }),
        signal: options.signal
      });

      if (!synthRes.ok) {
        throw new Error(`Failed to synthesize chunk ${cIdx + 1}/${plan.chunks.length}`);
      }

      const meta: TTSChunkMetadata = await synthRes.json();

      // Fetch actual audio blob
      const audioRes = await fetch(meta.audioUrl, { signal: options.signal });
      if (!audioRes.ok) {
        throw new Error(`Failed to fetch audio for chunk ${cIdx + 1}`);
      }

      const blob = await audioRes.blob();
      audioBlobs.push(blob);
      totalSizeBytes += blob.size;

      // Adjust timings relative to whole chapter start
      const adjustedSentences: TTSSentenceTiming[] = (meta.sentences || []).map(s => ({
        ...s,
        startMs: s.startMs + cumulativeDurationMs,
        endMs: s.endMs + cumulativeDurationMs
      }));

      const adjustedWords: TTSWordTiming[] = (meta.words || []).map(w => ({
        ...w,
        startMs: w.startMs + cumulativeDurationMs,
        endMs: w.endMs + cumulativeDurationMs
      }));

      chunks.push({
        chunkIndex: meta.chunkIndex,
        hash: meta.hash,
        durationMs: meta.durationMs,
        audioBlob: blob,
        sentences: adjustedSentences,
        words: adjustedWords
      });

      allSentences.push(...adjustedSentences);
      allWords.push(...adjustedWords);
      cumulativeDurationMs += meta.durationMs;

      if (options.onChunkProgress) {
        options.onChunkProgress(cIdx + 1, plan.chunks.length);
      }
    }

    if (options.signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const consolidatedBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });

    const offlineRecord: OfflineChapterRecord = {
      id: chapter.id,
      novelId,
      chapterNumber: chapter.number ?? 1,
      title: chapter.title || `Chapter ${chapter.number ?? 1}`,
      voice,
      pitch,
      durationMs: cumulativeDurationMs,
      sizeBytes: totalSizeBytes,
      downloadedAt: Date.now(),
      audioBlob: consolidatedBlob,
      chunks,
      sentences: allSentences,
      words: allWords
    };

    await saveOfflineChapter(offlineRecord);
    return offlineRecord;
  }, [novelId]);

  /**
   * Export continuous multi-chapter MP4 audio bundle (e.g. 10 chapters combined into 1 MP4 file)
   */
  const exportContinuousMP4Bundle = useCallback(async (
    chapters: ChapterLike[],
    options: {
      voice?: string;
      pitch?: string;
      bundleTitle?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<{ filename: string; blob: Blob }> => {
    if (chapters.length === 0) throw new Error('No chapters provided');
    if (options.signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const voice = options.voice || 'en-US-SteffanNeural';
    const pitch = options.pitch || '+0Hz';

    // Create 300s (5 minute) timeout signal chained with user abort signal if provided
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(new Error('Export request timed out after 5 minutes')), 300000);

    const onUserAbort = () => timeoutController.abort(options.signal?.reason || new DOMException('Aborted by user', 'AbortError'));
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw new DOMException('Aborted by user', 'AbortError');
      }
      options.signal.addEventListener('abort', onUserAbort);
    }

    try {
      const res = await fetch('/api/tts/export-bundle-mp4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapters,
          novelId,
          voice,
          pitch,
          bundleTitle: options.bundleTitle || 'Novel'
        }),
        signal: timeoutController.signal
      });

      if (options.signal?.aborted) {
        throw new DOMException('Aborted by user', 'AbortError');
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Export failed (HTTP ${res.status} ${res.statusText || 'Server Error'})`);
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('video/') && !contentType.includes('audio/') && !contentType.includes('application/octet-stream')) {
        const textSample = await res.text().catch(() => '');
        throw new Error(`Server returned invalid format (${contentType || 'text'}). Please check server connection.`);
      }

      let filename = '';
      const disposition = res.headers.get('Content-Disposition') || res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1].trim();
      }

      if (!filename) {
        const sanitizedNovel = (options.bundleTitle || 'Novel')
          .replace(/[^\w\s-]/g, '')
          .trim()
          .replace(/\s+/g, '_')
          .substring(0, 30) || 'Chapters';

        if (chapters.length === 1) {
          const chap = chapters[0];
          const chapNum = chap.number ?? 1;
          const chapTitle = (chap.title || 'Chapter')
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '_')
            .substring(0, 40);
          filename = `Chapter_${chapNum}_${chapTitle || 'Audio'}.mp4`;
        } else {
          const firstNum = chapters[0].number ?? 1;
          const lastNum = chapters[chapters.length - 1].number ?? (firstNum + chapters.length - 1);
          const startPad = String(firstNum).padStart(3, '0');
          const endPad = String(lastNum).padStart(3, '0');
          filename = `${sanitizedNovel}_${startPad}-${endPad}.mp4`;
        }
      }

      const blob = await res.blob();
      // Guard against proxy timeout HTML documents or empty blobs
      if (blob.size < 5000) {
        const textSample = await blob.text().catch(() => '');
        if (textSample.includes('<html') || textSample.includes('<!DOCTYPE') || textSample.includes('"error"')) {
          throw new Error('Server returned an error document instead of MP4 audio.');
        }
      }

      if (!options.signal?.aborted) {
        triggerBrowserDownload(blob, filename);
      }

      return { filename, blob };
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', onUserAbort);
      }
    }
  }, [novelId, triggerBrowserDownload]);

  /**
   * Direct export of a single chapter MP4 to device files.
   */
  const exportChapterMP4 = useCallback(async (
    chapter: ChapterLike,
    options: { voice?: string; pitch?: string; bundleTitle?: string; signal?: AbortSignal } = {}
  ): Promise<void> => {
    await exportContinuousMP4Bundle([chapter], options);
  }, [exportContinuousMP4Bundle]);

  /**
   * Downloads continuous batches (e.g. 50 chapters in batches of 10 -> 5 continuous MP4 files)
   * with smooth real-time progress updates, instant cancel support, and background persistence.
   */
  const downloadContinuousBatches = useCallback(async (
    chapters: ChapterLike[],
    batchSize: number = 10,
    options: { voice?: string; pitch?: string; bundleTitle?: string } = {}
  ): Promise<void> => {
    if (chapters.length === 0) return;

    // Abort any currently running download first
    if (activeAbortController) {
      activeAbortController.abort();
    }
    const controller = new AbortController();
    activeAbortController = controller;
    const signal = controller.signal;

    // Partition into batches of batchSize
    const batches: ChapterLike[][] = [];
    const validBatchSize = Math.max(1, Math.min(batchSize, chapters.length));
    for (let i = 0; i < chapters.length; i += validBatchSize) {
      batches.push(chapters.slice(i, i + validBatchSize));
    }

    const totalFiles = batches.length;
    const totalChapters = chapters.length;
    const initialFirstNum = batches[0][0].number ?? 1;
    const initialLastNum = batches[0][batches[0].length - 1].number ?? batches[0].length;
    const initialRange = `Ch. ${initialFirstNum}-${initialLastNum}`;

    updateGlobalDownloadProgress({
      isDownloading: true,
      currentChapterIndex: 1,
      totalChapters,
      currentChapterTitle: batches[0][0].title || `Chapter ${initialFirstNum}`,
      currentBatchIndex: 1,
      totalBatches: totalFiles,
      batchChapterRange: initialRange,
      percent: 1,
      statusText: `Preparing continuous download of ${totalFiles} MP4 file(s)...`,
      error: null
    });

    try {
      let completedChaptersCount = 0;

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }

        const currentBatch = batches[bIdx];
        const firstNum = currentBatch[0].number ?? (bIdx * validBatchSize + 1);
        const lastNum = currentBatch[currentBatch.length - 1].number ?? (firstNum + currentBatch.length - 1);
        const batchRange = `Ch. ${firstNum}-${lastNum}`;
        const batchLabel = `File ${bIdx + 1} of ${totalFiles} (${batchRange})`;

        const batchStartPercent = Math.round((bIdx / totalFiles) * 100);

        updateGlobalDownloadProgress(prev => ({
          ...prev,
          isDownloading: true,
          currentChapterIndex: completedChaptersCount + 1,
          currentChapterTitle: currentBatch[0].title || `Chapter ${firstNum}`,
          currentBatchIndex: bIdx + 1,
          totalBatches: totalFiles,
          batchChapterRange: batchRange,
          percent: Math.max(5, batchStartPercent + 10),
          statusText: `Generating continuous MP4: ${batchLabel}...`
        }));

        // Step 1: Generate & download the continuous MP4 bundle directly
        await exportContinuousMP4Bundle(currentBatch, {
          voice: options.voice,
          pitch: options.pitch,
          bundleTitle: options.bundleTitle,
          signal
        });

        if (signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }

        // Step 2: Cache chapters into browser IndexedDB for offline reader sync (chunks are already cached on server)
        updateGlobalDownloadProgress(prev => ({
          ...prev,
          percent: Math.min(95, batchStartPercent + 85),
          statusText: `Syncing offline reader data for ${batchLabel}...`
        }));

        for (let cInBatch = 0; cInBatch < currentBatch.length; cInBatch++) {
          if (signal.aborted) {
            throw new DOMException('Aborted by user', 'AbortError');
          }
          const currentChap = currentBatch[cInBatch];
          try {
            await downloadSingleChapter(currentChap, {
              voice: options.voice,
              pitch: options.pitch,
              signal
            });
          } catch (dbErr) {
            console.warn(`[useOfflineAudio] Could not cache chapter ${currentChap.id} in browser IndexedDB:`, dbErr);
          }
        }

        if (signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }

        completedChaptersCount += currentBatch.length;
        const batchDonePercent = Math.min(100, Math.round((completedChaptersCount / totalChapters) * 100));

        updateGlobalDownloadProgress(prev => ({
          ...prev,
          currentChapterIndex: completedChaptersCount,
          percent: batchDonePercent,
          statusText: `Downloaded ${batchLabel} (${completedChaptersCount}/${totalChapters} chapters)`
        }));
      }

      // Immediately set isDownloading to false and percent to 100 BEFORE awaiting refreshOfflineLibrary
      updateGlobalDownloadProgress({
        isDownloading: false,
        currentChapterIndex: totalChapters,
        totalChapters,
        currentChapterTitle: '',
        currentBatchIndex: totalFiles,
        totalBatches: totalFiles,
        batchChapterRange: '',
        percent: 100,
        statusText: `All ${totalFiles} continuous MP4 file(s) downloaded successfully!`,
        error: null
      });

      await refreshOfflineLibrary();

      // Clear completed status after 4 seconds
      setTimeout(() => {
        updateGlobalDownloadProgress(prev => {
          if (!prev.isDownloading && prev.percent === 100) {
            return {
              isDownloading: false,
              currentChapterIndex: 0,
              totalChapters: 0,
              currentChapterTitle: '',
              currentBatchIndex: 0,
              totalBatches: 0,
              batchChapterRange: '',
              percent: 0,
              statusText: '',
              error: null
            };
          }
          return prev;
        });
      }, 4000);

    } catch (err: any) {
      if (err.name === 'AbortError' || signal.aborted) {
        updateGlobalDownloadProgress({
          isDownloading: false,
          percent: 0,
          statusText: 'Download cancelled',
          error: 'Cancelled by user'
        });
      } else {
        console.error('Continuous batch download error:', err);
        updateGlobalDownloadProgress({
          isDownloading: false,
          statusText: 'Download failed',
          error: err.message || 'Error downloading MP4 bundles'
        });
      }
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    }
  }, [downloadSingleChapter, exportContinuousMP4Bundle, refreshOfflineLibrary]);

  /**
   * Delete an offline chapter
   */
  const deleteChapter = useCallback(async (chapterId: string) => {
    await dbDeleteOfflineChapter(chapterId);
    await refreshOfflineLibrary();
  }, [refreshOfflineLibrary]);

  /**
   * Clear all offline chapters
   */
  const clearAllChapters = useCallback(async () => {
    await dbClearAllOfflineChapters();
    await refreshOfflineLibrary();
  }, [refreshOfflineLibrary]);

  return {
    offlineChapters,
    storageUsage,
    downloadProgress,
    isChapterDownloaded: (chapterId: string) => offlineChapters.some(c => c.id === chapterId),
    downloadSingleChapter,
    exportChapterMP4,
    exportContinuousMP4Bundle,
    downloadContinuousBatches,
    deleteChapter,
    clearAllChapters,
    cancelDownload,
    refreshOfflineLibrary
  };
}
