export interface TTSWordTiming {
  word: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  sentenceIndex?: number;
  paragraphIndex?: number;
  wordIndex?: number;
}

export interface TTSSentenceTiming {
  text: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  paragraphIndex: number;
  sentenceIndex: number;
}

export interface TTSChunkMetadata {
  chunkIndex: number;
  hash: string;
  audioUrl: string;
  durationMs: number;
  paragraphStartIndex: number;
  paragraphEndIndex: number;
  sentences: TTSSentenceTiming[];
  words: TTSWordTiming[];
}

export interface TTSChunkPlan {
  chunkIndex: number;
  hash: string;
  text: string;
  paragraphStartIndex: number;
  paragraphEndIndex: number;
  sentences: {
    text: string;
    paragraphIndex: number;
    sentenceIndex: number;
  }[];
  isCached: boolean;
  audioUrl: string;
  voice?: string;
  pitch?: string;
}

export interface TTSChapterPlan {
  chapterId: string;
  chapterNumber?: number;
  title: string;
  voice: string;
  totalChunks: number;
  chunks: TTSChunkPlan[];
}

export interface TTSActivePosition {
  chapterId: string;
  chapterIndex: number;
  paragraphIndex: number; // -1 for title, 0..N for body paragraphs
  sentenceIndex: number;  // 0..M for sentence index in that paragraph
  wordIndex?: number;     // active word index
  wordText?: string;
  sentenceText?: string;
}

export interface EdgeReadAloudSettings {
  voice: string;
  pitch: number; // e.g. -20 to +20 (Hz offset)
  highlightMode: 'both' | 'sentence' | 'word' | 'none';
  autoScrollMode: 'center' | 'edge' | 'off';
  volume: number; // 0.0 to 1.0
  syncOffsetMs?: number; // Audio sync offset in milliseconds (-300 to +200, default -120ms)
  showClockInBar?: boolean; // Toggle for clock/timeline scrubber button in player header
}

export interface EdgeReadAloudState {
  isActive: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  playbackSpeed: number;
  currentChapterId: string;
  currentChapterIndex: number;
  currentChunkIndex: number;
  totalChunks: number;
  totalSentencesInChapter: number;
  currentSentenceIndexInChapter: number;
  activePosition: TTSActivePosition | null;
  error: string | null;
  // Part 4 additions
  sleepTimerMinutes: number | null; // null = off, -1 = end of chapter, >0 = minutes
  sleepTimerRemainingSec: number | null;
  isFadingOut: boolean;
  settings: EdgeReadAloudSettings;
}

export interface TTSCacheStats {
  audioFiles: number;
  totalSizeBytes: number;
}

