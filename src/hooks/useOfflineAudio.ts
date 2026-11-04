import { useState, useEffect, useCallback, useRef } from 'react';
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

interface ChapterLike {
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
  percent: number;
  statusText: string;
  error: string | null;
}

export function useOfflineAudio(novelId: string = 'novel') {
  const [offlineChapters, setOfflineChapters] = useState<OfflineChapterRecord[]>([]);
  const [storageUsage, setStorageUsage] = useState<{ totalBytes: number; totalMB: string; count: number }>({
    totalBytes: 0,
    totalMB: '0.0',
    count: 0
  });
  const [downloadProgress, setDownloadProgress] = useState<OfflineDownloadProgress>({
    isDownloading: false,
    currentChapterIndex: 0,
    totalChapters: 0,
    currentChapterTitle: '',
    percent: 0,
    statusText: '',
    error: null
  });

  const isCancelledRef = useRef<boolean>(false);

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

  // Cancel ongoing download
  const cancelDownload = useCallback(() => {
    isCancelledRef.current = true;
    setDownloadProgress(prev => ({
      ...prev,
      isDownloading: false,
      statusText: 'Download cancelled',
      error: 'Cancelled by user'
    }));
  }, []);

  // Helper: Trigger browser download for a Blob
  const triggerBrowserDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }, []);

  /**
   * Synthesizes and downloads a single chapter into IndexedDB.
   */
  const downloadSingleChapter = useCallback(async (
    chapter: ChapterLike,
    options: {
      voice?: string;
      pitch?: string;
      onChunkProgress?: (percent: number) => void;
    } = {}
  ): Promise<OfflineChapterRecord> => {
    const voice = options.voice || 'en-US-SteffanNeural';
    const pitch = options.pitch || '+0Hz';

    // 1. Get plan
    const planRes = await fetch('/api/tts/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter, novelId, voice, pitch })
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
      if (isCancelledRef.current) {
        throw new Error('Download cancelled by user');
      }

      const chunkPlan = plan.chunks[cIdx];

      // Synthesize chunk
      const synthRes = await fetch('/api/tts/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk: chunkPlan })
      });

      if (!synthRes.ok) {
        throw new Error(`Failed to synthesize chunk ${cIdx + 1}/${plan.chunks.length}`);
      }

      const meta: TTSChunkMetadata = await synthRes.json();

      // Fetch actual audio blob
      const audioRes = await fetch(meta.audioUrl);
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
        options.onChunkProgress(Math.round(((cIdx + 1) / plan.chunks.length) * 100));
      }
    }

    // Consolidated single MP3 Blob for continuous playback and direct export
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
   * Downloads a batch or range of chapters with interactive progress tracking.
   */
  const downloadChapterRange = useCallback(async (
    chapters: ChapterLike[],
    options: {
      voice?: string;
      pitch?: string;
      exportMP3Directly?: boolean;
    } = {}
  ): Promise<void> => {
    if (chapters.length === 0) return;

    isCancelledRef.current = false;
    setDownloadProgress({
      isDownloading: true,
      currentChapterIndex: 0,
      totalChapters: chapters.length,
      currentChapterTitle: chapters[0].title,
      percent: 0,
      statusText: `Preparing to download ${chapters.length} chapter(s)...`,
      error: null
    });

    try {
      for (let i = 0; i < chapters.length; i++) {
        if (isCancelledRef.current) break;

        const chap = chapters[i];
        setDownloadProgress(prev => ({
          ...prev,
          currentChapterIndex: i + 1,
          currentChapterTitle: chap.title || `Chapter ${chap.number ?? (i + 1)}`,
          statusText: `Downloading chapter ${i + 1} of ${chapters.length}...`,
          percent: Math.round((i / chapters.length) * 100)
        }));

        const record = await downloadSingleChapter(chap, {
          voice: options.voice,
          pitch: options.pitch,
          onChunkProgress: (chunkPct) => {
            const overallPct = Math.round(((i + (chunkPct / 100)) / chapters.length) * 100);
            setDownloadProgress(prev => ({
              ...prev,
              percent: overallPct,
              statusText: `Synthesizing ${chap.title}: ${chunkPct}%`
            }));
          }
        });

        if (options.exportMP3Directly) {
          const safeTitle = (chap.title || `Chapter_${chap.number ?? (i + 1)}`)
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '_');
          triggerBrowserDownload(record.audioBlob, `${safeTitle}.mp3`);
        }
      }

      await refreshOfflineLibrary();

      setDownloadProgress({
        isDownloading: false,
        currentChapterIndex: chapters.length,
        totalChapters: chapters.length,
        currentChapterTitle: '',
        percent: 100,
        statusText: `Successfully downloaded ${chapters.length} chapter(s)!`,
        error: null
      });

      // Clear completed status after 4 seconds
      setTimeout(() => {
        setDownloadProgress(prev => {
          if (!prev.isDownloading && prev.percent === 100) {
            return {
              isDownloading: false,
              currentChapterIndex: 0,
              totalChapters: 0,
              currentChapterTitle: '',
              percent: 0,
              statusText: '',
              error: null
            };
          }
          return prev;
        });
      }, 4000);

    } catch (err: any) {
      if (isCancelledRef.current) {
        setDownloadProgress(prev => ({
          ...prev,
          isDownloading: false,
          statusText: 'Download cancelled',
          error: 'Cancelled by user'
        }));
      } else {
        console.error('Download error:', err);
        setDownloadProgress(prev => ({
          ...prev,
          isDownloading: false,
          statusText: 'Download failed',
          error: err.message || 'Error downloading audio'
        }));
      }
    }
  }, [downloadSingleChapter, refreshOfflineLibrary, triggerBrowserDownload]);

  /**
   * Direct export of a single chapter MP3 to device files.
   */
  const exportChapterMP3 = useCallback(async (
    chapter: ChapterLike,
    options: { voice?: string; pitch?: string } = {}
  ): Promise<void> => {
    const existing = await getOfflineChapter(chapter.id);
    const safeTitle = (chapter.title || `Chapter_${chapter.number ?? 1}`)
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const filename = `${safeTitle}.mp3`;

    if (existing && existing.audioBlob) {
      triggerBrowserDownload(existing.audioBlob, filename);
      return;
    }

    // Not yet in IndexedDB: fetch from consolidated server export
    const voice = options.voice || 'en-US-SteffanNeural';
    const pitch = options.pitch || '+0Hz';

    const res = await fetch('/api/tts/export-chapter-mp3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter, novelId, voice, pitch })
    });

    if (!res.ok) {
      throw new Error(`Failed to export MP3: ${res.statusText}`);
    }

    const blob = await res.blob();
    triggerBrowserDownload(blob, filename);
  }, [novelId, triggerBrowserDownload]);

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
    downloadChapterRange,
    exportChapterMP3,
    deleteChapter,
    clearAllChapters,
    cancelDownload,
    refreshOfflineLibrary
  };
}
