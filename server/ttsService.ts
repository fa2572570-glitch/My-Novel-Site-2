import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { splitParagraphIntoSentences, tokenizeSentenceWords } from '../src/utils/ttsText';

const execFileAsync = promisify(execFile);

// STRICT VOICE MANDATE: All TTS requests must use this voice without substitution.
export const EDGE_TTS_VOICE = 'en-US-SteffanNeural';

export const CACHE_ROOT = path.resolve(process.cwd(), 'cache', 'tts');
export const AUDIO_CACHE_DIR = path.join(CACHE_ROOT, 'audio');
export const METADATA_CACHE_DIR = path.join(CACHE_ROOT, 'metadata');

// Ensure cache directories exist on startup
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(METADATA_CACHE_DIR)) {
  fs.mkdirSync(METADATA_CACHE_DIR, { recursive: true });
}

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

// Re-export for server consumers
export { splitParagraphIntoSentences, tokenizeSentenceWords };

// Safely escapes characters for Edge TTS SSML XML payload
export function escapeXmlForSSML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generates a deterministic SHA-256 hash for caching
export function computeChunkHash(
  novelId: string,
  chapterId: string,
  chunkIndex: number,
  text: string,
  voice: string = EDGE_TTS_VOICE,
  pitch: string = '+0Hz'
): string {
  const payload = `v3_edge_sync:${novelId || 'novel'}:${chapterId}:${voice || EDGE_TTS_VOICE}:${pitch || '+0Hz'}:${chunkIndex}:${text.trim()}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 24);
}

// Breaks chapter into intelligently sized chunks:
// - Chunk 0: Title + first 1-2 short paragraphs (~400-800 chars) for ultra-low initial start latency
// - Subsequent chunks: 2-4 paragraphs (~1000-1400 chars)
export function planChapterChunks(
  chapter: { id: string; number?: number; title: string; content: string[] },
  novelId: string = 'novel',
  options?: { voice?: string; pitch?: string }
): TTSChapterPlan {
  const selectedVoice = options?.voice || EDGE_TTS_VOICE;
  const selectedPitch = options?.pitch || '+0Hz';
  const chunks: TTSChunkPlan[] = [];
  const paragraphs = chapter.content || [];

  interface SentenceRef {
    text: string;
    paragraphIndex: number;
    sentenceIndex: number;
  }

  const allSentences: SentenceRef[] = [];

  // Paragraph -1 represents the Chapter Title if present
  if (chapter.title && chapter.title.trim()) {
    const titleSentences = splitParagraphIntoSentences(chapter.title.trim());
    titleSentences.forEach((sText, sIdx) => {
      allSentences.push({
        text: sText,
        paragraphIndex: -1,
        sentenceIndex: sIdx
      });
    });
  }

  // Add all body paragraphs
  paragraphs.forEach((pText, pIdx) => {
    if (!pText || !pText.trim()) return;
    const pSentences = splitParagraphIntoSentences(pText.trim());
    pSentences.forEach((sText, sIdx) => {
      allSentences.push({
        text: sText,
        paragraphIndex: pIdx,
        sentenceIndex: sIdx
      });
    });
  });

  if (allSentences.length === 0) {
    allSentences.push({
      text: chapter.title || `Chapter ${chapter.number || 1}`,
      paragraphIndex: -1,
      sentenceIndex: 0
    });
  }

  let currentChunkSentences: SentenceRef[] = [];
  let currentChunkCharCount = 0;
  let chunkIdx = 0;

  // Target char limit: smaller initial chunk (550 chars) for instant playback, 850 chars for subsequent chunks
  // to ensure synthesis completes reliably in 6-10s without WebSocket stream timeouts
  const getTargetCharLimit = (idx: number) => (idx === 0 ? 550 : 850);

  for (let i = 0; i < allSentences.length; i++) {
    const sentence = allSentences[i];
    const sentenceLen = sentence.text.length;

    // Check if adding this sentence exceeds target limit, but always include at least one sentence
    if (currentChunkSentences.length > 0 && (currentChunkCharCount + sentenceLen > getTargetCharLimit(chunkIdx))) {
      // Finalize current chunk
      const chunkText = currentChunkSentences.map(s => s.text).join(' ');
      const pStart = currentChunkSentences[0].paragraphIndex;
      const pEnd = currentChunkSentences[currentChunkSentences.length - 1].paragraphIndex;
      const hash = computeChunkHash(novelId, chapter.id, chunkIdx, chunkText, selectedVoice, selectedPitch);

      const audioFile = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);
      const metaFile = path.join(METADATA_CACHE_DIR, `${hash}.json`);
      const isCached = fs.existsSync(audioFile) && fs.existsSync(metaFile) && fs.statSync(audioFile).size > 0;

      chunks.push({
        chunkIndex: chunkIdx,
        hash,
        text: chunkText,
        voice: selectedVoice,
        pitch: selectedPitch,
        paragraphStartIndex: pStart,
        paragraphEndIndex: pEnd,
        sentences: [...currentChunkSentences],
        isCached,
        audioUrl: `/api/tts/audio/${hash}.mp3`
      });

      chunkIdx++;
      currentChunkSentences = [];
      currentChunkCharCount = 0;
    }

    currentChunkSentences.push(sentence);
    currentChunkCharCount += sentenceLen + 1;
  }

  // Push remaining sentences as final chunk
  if (currentChunkSentences.length > 0) {
    const chunkText = currentChunkSentences.map(s => s.text).join(' ');
    const pStart = currentChunkSentences[0].paragraphIndex;
    const pEnd = currentChunkSentences[currentChunkSentences.length - 1].paragraphIndex;
    const hash = computeChunkHash(novelId, chapter.id, chunkIdx, chunkText, selectedVoice, selectedPitch);

    const audioFile = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);
    const metaFile = path.join(METADATA_CACHE_DIR, `${hash}.json`);
    const isCached = fs.existsSync(audioFile) && fs.existsSync(metaFile) && fs.statSync(audioFile).size > 0;

    chunks.push({
      chunkIndex: chunkIdx,
      hash,
      text: chunkText,
      voice: selectedVoice,
      pitch: selectedPitch,
      paragraphStartIndex: pStart,
      paragraphEndIndex: pEnd,
      sentences: [...currentChunkSentences],
      isCached,
      audioUrl: `/api/tts/audio/${hash}.mp3`
    });
  }

  return {
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    title: chapter.title || 'Untitled',
    voice: selectedVoice,
    totalChunks: chunks.length,
    chunks
  };
}

// In-memory mutex map to prevent duplicate concurrent synthesis for the same chunk hash
const activeSyntheses = new Map<string, Promise<TTSChunkMetadata>>();

// Synthesizes a chunk or retrieves it instantly from disk cache
export async function synthesizeChunk(
  chunk: {
    chunkIndex: number;
    hash: string;
    text: string;
    voice?: string;
    pitch?: string;
    paragraphStartIndex: number;
    paragraphEndIndex: number;
    sentences: {
      text: string;
      paragraphIndex: number;
      sentenceIndex: number;
    }[];
  }
): Promise<TTSChunkMetadata> {
  const hash = chunk.hash;
  const voice = chunk.voice || EDGE_TTS_VOICE;
  const pitch = chunk.pitch || '+0Hz';
  const audioFile = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);
  const metaFile = path.join(METADATA_CACHE_DIR, `${hash}.json`);

  // 1. Return immediately from disk cache if already generated
  if (fs.existsSync(audioFile) && fs.existsSync(metaFile)) {
    try {
      const audioSize = fs.statSync(audioFile).size;
      if (audioSize > 0) {
        const cachedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        return {
          chunkIndex: chunk.chunkIndex,
          hash,
          audioUrl: `/api/tts/audio/${hash}.mp3`,
          durationMs: cachedMeta.durationMs || 0,
          paragraphStartIndex: chunk.paragraphStartIndex,
          paragraphEndIndex: chunk.paragraphEndIndex,
          sentences: cachedMeta.sentences || [],
          words: cachedMeta.words || []
        };
      }
    } catch (err) {
      console.warn(`Cache entry corrupted for ${hash}, regenerating...`, err);
    }
  }

  // 2. Prevent concurrent synthesis of the same hash
  if (activeSyntheses.has(hash)) {
    return activeSyntheses.get(hash)!;
  }

  const synthesisPromise = (async () => {
    // Unique isolated temp directory to prevent file collisions during concurrent requests
    const tempDir = path.join(CACHE_ROOT, `tmp_${hash}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    let tts: MsEdgeTTS | null = null;
    try {
      const safeText = escapeXmlForSSML(chunk.text);
      let res: { audioFilePath: string; metadataFilePath: string | null } | null = null;
      let lastError: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (!tts) {
            tts = new MsEdgeTTS({ connectionTimeoutMs: 15000 });
            await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
              wordBoundaryEnabled: true,
              sentenceBoundaryEnabled: true
            });
          }
          const timeoutMs = Math.max(45000, Math.ceil(safeText.length * 50));
          const toFilePromise = tts.toFile(tempDir, safeText, { pitch });
          const timeoutPromise = new Promise<{ audioFilePath: string; metadataFilePath: string | null }>((_, reject) => {
            setTimeout(() => reject(new Error(`Edge TTS toFile timed out for chunk ${hash} after ${timeoutMs}ms`)), timeoutMs);
          });
          res = await Promise.race([toFilePromise, timeoutPromise]);
          if (res?.audioFilePath && fs.existsSync(res.audioFilePath) && fs.statSync(res.audioFilePath).size > 0) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Edge TTS attempt ${attempt} failed for chunk ${hash}:`, err?.message || err);
          if (tts) {
            try { tts.close(); } catch {}
            tts = null;
          }
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 600));
          }
        }
      }

      if (!res || !res.audioFilePath || !fs.existsSync(res.audioFilePath) || fs.statSync(res.audioFilePath).size === 0) {
        throw new Error(lastError?.message || 'Edge TTS did not generate audio output file');
      }

      const tempAudio = res.audioFilePath;
      const tempMeta = res.metadataFilePath;

      // Move audio to permanent audio cache
      fs.copyFileSync(tempAudio, audioFile);

      // Parse metadata
      let rawMetadata: { Metadata?: Array<{ Type: string; Data: any }> } = { Metadata: [] };
      if (tempMeta && fs.existsSync(tempMeta)) {
        try {
          rawMetadata = JSON.parse(fs.readFileSync(tempMeta, 'utf8'));
        } catch (e) {
          console.warn('Failed to parse raw metadata JSON:', e);
        }
      }

      // Extract and normalize boundaries (Edge ticks = 100ns -> divide by 10,000 for ms)
      const rawSentences: TTSSentenceTiming[] = [];
      const rawWords: TTSWordTiming[] = [];

      for (const item of rawMetadata.Metadata || []) {
        const offsetMs = Math.round((item.Data?.Offset || 0) / 10000);
        const durationMs = Math.round((item.Data?.Duration || 0) / 10000);
        const textVal = item.Data?.text?.Text || '';

        if (item.Type === 'SentenceBoundary') {
          rawSentences.push({
            text: textVal,
            startMs: offsetMs,
            durationMs,
            endMs: offsetMs + durationMs,
            paragraphIndex: 0,
            sentenceIndex: 0
          });
        } else if (item.Type === 'WordBoundary') {
          rawWords.push({
            word: textVal,
            startMs: offsetMs,
            durationMs,
            endMs: offsetMs + durationMs
          });
        }
      }

      // Correlate Edge TTS word boundaries with our structured sentences and word tokens
      function cleanWord(str: string): string {
        return (str || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      }

      const correlatedWords: TTSWordTiming[] = [];
      const correlatedSentences: TTSSentenceTiming[] = [];
      let rawIdx = 0;

      for (let sIdx = 0; sIdx < chunk.sentences.length; sIdx++) {
        const s = chunk.sentences[sIdx];
        const tokens = tokenizeSentenceWords(s.text);
        const wordTokens = tokens.filter(t => t.isWord);
        const matchedWordsThisSentence: TTSWordTiming[] = [];

        for (let wIdx = 0; wIdx < wordTokens.length; wIdx++) {
          const tok = wordTokens[wIdx];
          const cleanTok = cleanWord(tok.text);
          let assignedStartMs = 0;
          let assignedEndMs = 0;

          if (rawIdx < rawWords.length) {
            const rawW = rawWords[rawIdx];
            const cleanRaw = cleanWord(rawW.word);

            if (cleanTok === cleanRaw) {
              assignedStartMs = rawW.startMs;
              assignedEndMs = rawW.endMs;
              rawIdx++;
            } else if (cleanRaw.startsWith(cleanTok)) {
              // Raw word from Edge TTS is a compound word (e.g. "sixteen-year-old")
              assignedStartMs = rawW.startMs;
              assignedEndMs = rawW.endMs;
              // Check if the next token is also part of this compound
              const nextTok = wordTokens[wIdx + 1];
              if (!nextTok || !cleanRaw.includes(cleanWord(nextTok.text))) {
                rawIdx++;
              }
            } else if (cleanTok.startsWith(cleanRaw)) {
              // Token in our text is a compound containing multiple raw words
              assignedStartMs = rawW.startMs;
              assignedEndMs = rawW.endMs;
              rawIdx++;
              while (rawIdx < rawWords.length && cleanTok.includes(cleanWord(rawWords[rawIdx].word))) {
                assignedEndMs = rawWords[rawIdx].endMs;
                rawIdx++;
              }
            } else {
              // Lookahead for 1-2 words to re-align
              let foundAhead = -1;
              for (let look = 1; look <= 2 && rawIdx + look < rawWords.length; look++) {
                if (cleanWord(rawWords[rawIdx + look].word) === cleanTok) {
                  foundAhead = rawIdx + look;
                  break;
                }
              }

              if (foundAhead !== -1) {
                rawIdx = foundAhead;
                assignedStartMs = rawWords[rawIdx].startMs;
                assignedEndMs = rawWords[rawIdx].endMs;
                rawIdx++;
              } else {
                // If next token matches current raw word, this token was skipped by speech engine
                const nextTok = wordTokens[wIdx + 1];
                if (nextTok && cleanWord(nextTok.text) === cleanRaw) {
                  const prevEnd = correlatedWords.length > 0 
                    ? correlatedWords[correlatedWords.length - 1].endMs 
                    : rawW.startMs;
                  assignedStartMs = prevEnd;
                  assignedEndMs = rawW.startMs;
                } else {
                  // Fallback match
                  assignedStartMs = rawW.startMs;
                  assignedEndMs = rawW.endMs;
                  rawIdx++;
                }
              }
            }
          } else {
            // Out of raw words: interpolate
            const prevEnd = correlatedWords.length > 0 
              ? correlatedWords[correlatedWords.length - 1].endMs 
              : (sIdx * 2000);
            assignedStartMs = prevEnd;
            assignedEndMs = prevEnd + 250;
          }

          if (assignedEndMs <= assignedStartMs) {
            assignedEndMs = assignedStartMs + 100;
          }

          const wordTiming: TTSWordTiming = {
            word: tok.text,
            startMs: assignedStartMs,
            durationMs: assignedEndMs - assignedStartMs,
            endMs: assignedEndMs,
            paragraphIndex: s.paragraphIndex,
            sentenceIndex: s.sentenceIndex,
            wordIndex: tok.wordIndex
          };

          matchedWordsThisSentence.push(wordTiming);
          correlatedWords.push(wordTiming);
        }

        // Determine sentence timing boundaries
        let sentenceStartMs = 0;
        let sentenceEndMs = 0;

        if (matchedWordsThisSentence.length > 0) {
          sentenceStartMs = sIdx === 0 ? 0 : matchedWordsThisSentence[0].startMs;
          sentenceEndMs = matchedWordsThisSentence[matchedWordsThisSentence.length - 1].endMs;
        } else {
          const prevEnd = correlatedSentences.length > 0 
            ? correlatedSentences[correlatedSentences.length - 1].endMs 
            : (sIdx * 2000);
          sentenceStartMs = prevEnd;
          sentenceEndMs = prevEnd + 2000;
        }

        correlatedSentences.push({
          text: s.text,
          startMs: sentenceStartMs,
          durationMs: Math.max(100, sentenceEndMs - sentenceStartMs),
          endMs: sentenceEndMs,
          paragraphIndex: s.paragraphIndex,
          sentenceIndex: s.sentenceIndex
        });
      }

      // Chain sentence boundaries so there are ZERO gaps or overlaps between consecutive sentences
      for (let i = 0; i < correlatedSentences.length - 1; i++) {
        const cur = correlatedSentences[i];
        const nxt = correlatedSentences[i + 1];
        cur.endMs = nxt.startMs;
        cur.durationMs = Math.max(100, cur.endMs - cur.startMs);
      }

      // Compute total duration
      let maxEndMs = 0;
      for (const w of rawWords) {
        if (w.endMs > maxEndMs) maxEndMs = w.endMs;
      }
      for (const w of correlatedWords) {
        if (w.endMs > maxEndMs) maxEndMs = w.endMs;
      }
      for (const s of correlatedSentences) {
        if (s.endMs > maxEndMs) maxEndMs = s.endMs;
      }
      if (correlatedSentences.length > 0) {
        const lastSent = correlatedSentences[correlatedSentences.length - 1];
        if (maxEndMs > lastSent.startMs) {
          lastSent.endMs = maxEndMs;
          lastSent.durationMs = lastSent.endMs - lastSent.startMs;
        }
      }

      const finalMeta: TTSChunkMetadata = {
        chunkIndex: chunk.chunkIndex,
        hash,
        audioUrl: `/api/tts/audio/${hash}.mp3`,
        durationMs: maxEndMs,
        paragraphStartIndex: chunk.paragraphStartIndex,
        paragraphEndIndex: chunk.paragraphEndIndex,
        sentences: correlatedSentences,
        words: correlatedWords
      };

      // Save normalized metadata to permanent cache
      fs.writeFileSync(metaFile, JSON.stringify(finalMeta, null, 2), 'utf8');

      return finalMeta;
    } finally {
      if (tts) {
        try {
          tts.close();
        } catch (e) {
          // ignore close errors
        }
      }
      // Clean up temp directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        // ignore cleanup errors
      }
    }
  })();

  activeSyntheses.set(hash, synthesisPromise);

  try {
    const result = await synthesisPromise;
    return result;
  } finally {
    activeSyntheses.delete(hash);
  }
}

// Background batch preloader: preloads specified chunks in parallel/sequence without blocking
export async function preloadChunks(chunks: TTSChunkPlan[]): Promise<void> {
  for (const chunk of chunks) {
    if (!chunk.isCached) {
      try {
        await synthesizeChunk(chunk);
      } catch (err) {
        console.warn(`Failed to preload chunk ${chunk.hash}:`, err);
      }
    }
  }
}

// Helper to get stats of TTS cache
export function getTTSCacheStats(): { audioFiles: number; totalSizeBytes: number } {
  let count = 0;
  let totalBytes = 0;
  if (fs.existsSync(AUDIO_CACHE_DIR)) {
    const files = fs.readdirSync(AUDIO_CACHE_DIR);
    count = files.length;
    for (const f of files) {
      try {
        totalBytes += fs.statSync(path.join(AUDIO_CACHE_DIR, f)).size;
      } catch (e) {}
    }
  }
  return { audioFiles: count, totalSizeBytes: totalBytes };
}

// Clears all audio and metadata cache files
export function clearTTSCache(): { removedFiles: number; freedBytes: number } {
  let removedFiles = 0;
  let freedBytes = 0;
  if (fs.existsSync(AUDIO_CACHE_DIR)) {
    const files = fs.readdirSync(AUDIO_CACHE_DIR);
    for (const f of files) {
      try {
        const fp = path.join(AUDIO_CACHE_DIR, f);
        freedBytes += fs.statSync(fp).size;
        fs.unlinkSync(fp);
        removedFiles++;
      } catch (e) {}
    }
  }
  if (fs.existsSync(METADATA_CACHE_DIR)) {
    const files = fs.readdirSync(METADATA_CACHE_DIR);
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(METADATA_CACHE_DIR, f));
      } catch (e) {}
    }
  }
  return { removedFiles, freedBytes };
}

// Concatenates all chunk MP3 buffers for a chapter into a single consolidated audio Buffer
export async function getOrSynthesizeChapterAudioBuffers(
  chapter: { id: string; number?: number; title: string; content: string[] },
  novelId: string = 'novel',
  options?: { voice?: string; pitch?: string }
): Promise<{ buffer: Buffer; durationMs: number; filename: string }> {
  const plan = planChapterChunks(chapter, novelId, options);
  const buffers: Buffer[] = [];
  let totalDurationMs = 0;

  for (const chunk of plan.chunks) {
    const meta = await synthesizeChunk(chunk);
    const audioFilePath = path.join(AUDIO_CACHE_DIR, `${meta.hash}.mp3`);
    if (fs.existsSync(audioFilePath)) {
      buffers.push(fs.readFileSync(audioFilePath));
      totalDurationMs += meta.durationMs;
    }
  }

  const combined = Buffer.concat(buffers);
  const sanitizedTitle = (chapter.title || 'Chapter')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 50);
  const chapNum = chapter.number ?? 1;
  const filename = `Chapter_${chapNum}_${sanitizedTitle || 'Audio'}.mp3`;

  return {
    buffer: combined,
    durationMs: totalDurationMs,
    filename
  };
}

// Export one or more chapters into a single continuous MP4 audio file using FFmpeg AAC
export async function exportChapterBundleMP4(
  chapters: Array<{ id: string; number?: number; title: string; content: string[] }>,
  novelId: string = 'novel',
  options?: { voice?: string; pitch?: string; bundleTitle?: string },
  checkAborted?: () => boolean
): Promise<{ buffer: Buffer; durationMs: number; filename: string }> {
  if (!chapters || chapters.length === 0) {
    throw new Error('At least one chapter is required to export audio bundle');
  }

  const chunkFilePaths: string[] = [];
  let totalDurationMs = 0;

  interface FlattenedChunk {
    chunk: ReturnType<typeof planChapterChunks>['chunks'][0];
  }
  const allChunks: FlattenedChunk[] = [];
  for (const chapter of chapters) {
    if (checkAborted?.()) {
      throw new Error('Operation aborted by client');
    }
    const plan = planChapterChunks(chapter, novelId, options);
    for (const chunk of plan.chunks) {
      allChunks.push({ chunk });
    }
  }

  console.log(`[exportChapterBundleMP4] Starting for ${chapters.length} chapters (${allChunks.length} chunks total)...`);

  // Synthesize chunks with safe concurrency pool of 2 to avoid Edge TTS WebSocket throttling
  const concurrency = 2;
  const chunkResults: Array<{ hash: string; durationMs: number }> = new Array(allChunks.length);

  for (let i = 0; i < allChunks.length; i += concurrency) {
    if (checkAborted?.()) {
      throw new Error('Operation aborted by client');
    }
    const slice = allChunks.slice(i, i + concurrency);
    const results = await Promise.all(
      slice.map(item => synthesizeChunk(item.chunk))
    );
    for (let j = 0; j < results.length; j++) {
      const meta = results[j];
      chunkResults[i + j] = { hash: meta.hash, durationMs: meta.durationMs };
    }
  }

  for (const item of chunkResults) {
    if (!item) continue;
    const audioFilePath = path.join(AUDIO_CACHE_DIR, `${item.hash}.mp3`);
    if (fs.existsSync(audioFilePath)) {
      chunkFilePaths.push(audioFilePath);
      totalDurationMs += item.durationMs;
    }
  }

  console.log(`[exportChapterBundleMP4] Chunks ready: ${chunkFilePaths.length}/${allChunks.length}. Running FFmpeg...`);

  if (checkAborted?.()) {
    throw new Error('Operation aborted by client');
  }

  if (chunkFilePaths.length === 0) {
    throw new Error('No audio chunks could be generated for the requested chapters');
  }

  // Create temporary workspace for FFmpeg concat manifest
  const tempDir = path.join(CACHE_ROOT, 'temp', `bundle_${crypto.randomBytes(8).toString('hex')}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const manifestPath = path.join(tempDir, 'concat_list.txt');
  const outputMp4Path = path.join(tempDir, 'output.mp4');

  try {
    if (checkAborted?.()) {
      throw new Error('Operation aborted by client');
    }

    // Write concat file
    const manifestContent = chunkFilePaths
      .map(fp => `file '${fp.replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');

    let buffer: Buffer;
    let isMp4 = false;

    // Attempt FFmpeg AAC MP4 encoding if ffmpeg binary is present on system
    try {
      const tFfmpeg = Date.now();
      await execFileAsync('ffmpeg', [
        '-nostdin',
        '-loglevel', 'warning',
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', manifestPath,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputMp4Path
      ], { timeout: 60000, maxBuffer: 50 * 1024 * 1024 });

      if (fs.existsSync(outputMp4Path)) {
        buffer = fs.readFileSync(outputMp4Path);
        isMp4 = true;
        console.log(`[exportChapterBundleMP4] FFmpeg finished in ${Date.now() - tFfmpeg}ms.`);
      } else {
        throw new Error('FFmpeg output file missing');
      }
    } catch (ffmpegErr: any) {
      console.warn(`[exportChapterBundleMP4] FFmpeg not found or failed (${ffmpegErr.message}). Falling back to seamless MP3 concatenation (Termux-compatible zero-dependency audio)...`);
      // Seamless MP3 fallback: Concatenate all synthesized MP3 chunk files directly using Node Buffer.concat
      const mp3Buffers = chunkFilePaths.map(fp => fs.readFileSync(fp));
      buffer = Buffer.concat(mp3Buffers);
      isMp4 = false;
      console.log(`[exportChapterBundleMP4] Seamless MP3 bundle created successfully (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`);
    }

    // Generate clear, clean filename with matching extension (.mp4 or .mp3)
    const ext = isMp4 ? 'mp4' : 'mp3';
    let filename: string;
    const sanitizedNovel = (options?.bundleTitle || 'Novel')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 30);

    if (chapters.length === 1) {
      const chap = chapters[0];
      const chapNum = chap.number ?? 1;
      const chapTitle = (chap.title || 'Chapter')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .substring(0, 40);
      filename = `Chapter_${chapNum}_${chapTitle || 'Audio'}.${ext}`;
    } else {
      const firstNum = chapters[0].number ?? 1;
      const lastNum = chapters[chapters.length - 1].number ?? (firstNum + chapters.length - 1);
      const startPad = String(firstNum).padStart(3, '0');
      const endPad = String(lastNum).padStart(3, '0');
      filename = `${sanitizedNovel || 'Chapters'}_${startPad}-${endPad}.${ext}`;
    }

    // Save a copy in AUDIO_CACHE_DIR for direct download URL access
    try {
      const cachedFilePath = path.join(AUDIO_CACHE_DIR, filename);
      fs.writeFileSync(cachedFilePath, buffer);
    } catch (e) {
      // ignore cache copy errors
    }

    return {
      buffer,
      durationMs: totalDurationMs,
      filename
    };
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

