import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TTSActivePosition,
  TTSChapterPlan,
  TTSChunkPlan,
  TTSChunkMetadata,
  TTSSentenceTiming,
  EdgeReadAloudState,
  EdgeReadAloudSettings,
  TTSCacheStats
} from '../types/tts';

interface Chapter {
  id: string;
  number: number;
  title: string;
  content: string[];
}

interface UseEdgeReadAloudOptions {
  chapters: Chapter[];
  currentChapterIndex: number;
  novelId?: string;
  novelTitle?: string;
  onChapterChange?: (newIndex: number) => void;
}

export function useEdgeReadAloud({
  chapters,
  currentChapterIndex,
  novelId = 'novel',
  novelTitle = 'Novel Reader',
  onChapterChange
}: UseEdgeReadAloudOptions) {
  // Playback speeds supported (matches Edge TTS)
  const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  // Settings with persistent localStorage memory
  const [settings, setSettings] = useState<EdgeReadAloudSettings>(() => {
    const savedVoice = localStorage.getItem('edge_tts_voice') || 'en-US-SteffanNeural';
    const savedPitch = parseInt(localStorage.getItem('edge_tts_pitch') || '0', 10);
    const savedHighlight = (localStorage.getItem('edge_tts_highlight_mode') as any) || 'both';
    const savedAutoScroll = (localStorage.getItem('edge_tts_auto_scroll') as any) || 'center';
    const savedVol = parseFloat(localStorage.getItem('edge_tts_volume') || '1.0');
    const savedSync = parseInt(localStorage.getItem('edge_tts_sync_offset') || '-120', 10);
    const savedShowClock = localStorage.getItem('edge_tts_show_clock');

    return {
      voice: savedVoice,
      pitch: isNaN(savedPitch) ? 0 : savedPitch,
      highlightMode: savedHighlight,
      autoScrollMode: savedAutoScroll,
      volume: isNaN(savedVol) ? 1.0 : Math.max(0, Math.min(1, savedVol)),
      syncOffsetMs: isNaN(savedSync) ? -120 : Math.max(-300, Math.min(200, savedSync)),
      showClockInBar: savedShowClock !== null ? savedShowClock === 'true' : true
    };
  });

  const settingsRef = useRef<EdgeReadAloudSettings>(settings);
  settingsRef.current = settings;

  // Sleep Timer state
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState<number | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const sleepTimerMinRef = useRef<number | null>(null);
  sleepTimerMinRef.current = sleepTimerMinutes;

  const [state, setState] = useState<EdgeReadAloudState>(() => {
    const savedSpeed = parseFloat(localStorage.getItem('edge_tts_playback_speed') || '1.0');
    return {
      isActive: false,
      isPlaying: false,
      isLoading: false,
      playbackSpeed: isNaN(savedSpeed) ? 1.0 : savedSpeed,
      currentChapterId: '',
      currentChapterIndex: currentChapterIndex || 0,
      currentChunkIndex: 0,
      totalChunks: 0,
      totalSentencesInChapter: 0,
      currentSentenceIndexInChapter: 0,
      activePosition: null,
      error: null,
      sleepTimerMinutes: null,
      sleepTimerRemainingSec: null,
      isFadingOut: false,
      settings: {
        voice: 'en-US-SteffanNeural',
        pitch: 0,
        highlightMode: 'both',
        autoScrollMode: 'center',
        volume: 1.0,
        syncOffsetMs: -120
      }
    };
  });

  // Keep state.settings and sleep timer in sync
  useEffect(() => {
    setState(prev => ({
      ...prev,
      settings,
      sleepTimerMinutes,
      sleepTimerRemainingSec,
      isFadingOut
    }));
  }, [settings, sleepTimerMinutes, sleepTimerRemainingSec, isFadingOut]);

  // Dual audio players for seamless gapless playback
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activePlayerRef = useRef<'A' | 'B'>('A');

  // References to keep callbacks current without re-attaching listeners
  const chaptersRef = useRef<Chapter[]>(chapters);
  chaptersRef.current = chapters;

  const currentChapterIndexRef = useRef<number>(currentChapterIndex);
  currentChapterIndexRef.current = state.currentChapterIndex;

  const currentChunkIndexRef = useRef<number>(0);
  currentChunkIndexRef.current = state.currentChunkIndex;

  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = state.isPlaying;

  const activePosRef = useRef<TTSActivePosition | null>(null);
  activePosRef.current = state.activePosition;

  // Persistent playback speed ref to prevent stale closures and browser resets
  const playbackSpeedRef = useRef<number>(state.playbackSpeed);
  playbackSpeedRef.current = state.playbackSpeed;

  // Mutable reference to playChunk to avoid stale closures in onended transitions
  const playChunkRef = useRef<((chapterIndex: number, chunkIndex: number, startOffsetSec?: number) => Promise<void>) | null>(null);

  // Cached chapter plans and chunk metadata in memory
  const plansCacheRef = useRef<Map<string, TTSChapterPlan>>(new Map());
  const chunksCacheRef = useRef<Map<string, TTSChunkMetadata>>(new Map());

  // Current active chapter plan & active chunk metadata
  const currentChapterPlanRef = useRef<TTSChapterPlan | null>(null);
  const currentChunkMetaRef = useRef<TTSChunkMetadata | null>(null);

  // Animation frame loop for 60fps word & sentence tracking
  const animFrameRef = useRef<number | null>(null);

  // Detached scroll tracking (allows user to scroll past reading text without snapback)
  const [isDetached, setIsDetached] = useState<boolean>(false);
  const [detachedDirection, setDetachedDirection] = useState<'above' | 'below' | null>(null);
  const isDetachedRef = useRef<boolean>(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimerRef = useRef<any>(null);
  const userGestureActiveRef = useRef<boolean>(false);
  const userGestureTimerRef = useRef<any>(null);

  // Detect explicit user gestures (touch / wheel / pointer)
  useEffect(() => {
    const onUserTouchOrWheel = () => {
      userGestureActiveRef.current = true;
      if (userGestureTimerRef.current) clearTimeout(userGestureTimerRef.current);
      userGestureTimerRef.current = setTimeout(() => {
        userGestureActiveRef.current = false;
      }, 1500);
    };

    window.addEventListener('touchstart', onUserTouchOrWheel, { passive: true });
    window.addEventListener('wheel', onUserTouchOrWheel, { passive: true });
    window.addEventListener('touchmove', onUserTouchOrWheel, { passive: true });
    window.addEventListener('pointerdown', onUserTouchOrWheel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onUserTouchOrWheel);
      window.removeEventListener('wheel', onUserTouchOrWheel);
      window.removeEventListener('touchmove', onUserTouchOrWheel);
      window.removeEventListener('pointerdown', onUserTouchOrWheel);
      if (userGestureTimerRef.current) clearTimeout(userGestureTimerRef.current);
    };
  }, []);

  // Initialize audio elements once
  useEffect(() => {
    const a = new Audio();
    const b = new Audio();
    a.preload = 'auto';
    b.preload = 'auto';
    a.volume = settingsRef.current.volume;
    b.volume = settingsRef.current.volume;
    
    // Explicitly configure playback rate and default rate so browser does not reset on load
    const curSpeed = playbackSpeedRef.current;
    a.defaultPlaybackRate = curSpeed;
    b.defaultPlaybackRate = curSpeed;
    a.playbackRate = curSpeed;
    b.playbackRate = curSpeed;

    // Enforce playback rate on both audio elements whenever they start playing or load metadata
    const enforceSpeedA = () => {
      const speed = playbackSpeedRef.current;
      if (a.playbackRate !== speed) a.playbackRate = speed;
      if (a.defaultPlaybackRate !== speed) a.defaultPlaybackRate = speed;
    };
    const enforceSpeedB = () => {
      const speed = playbackSpeedRef.current;
      if (b.playbackRate !== speed) b.playbackRate = speed;
      if (b.defaultPlaybackRate !== speed) b.defaultPlaybackRate = speed;
    };

    a.addEventListener('play', enforceSpeedA);
    a.addEventListener('playing', enforceSpeedA);
    a.addEventListener('canplay', enforceSpeedA);
    a.addEventListener('loadedmetadata', enforceSpeedA);

    b.addEventListener('play', enforceSpeedB);
    b.addEventListener('playing', enforceSpeedB);
    b.addEventListener('canplay', enforceSpeedB);
    b.addEventListener('loadedmetadata', enforceSpeedB);

    audioARef.current = a;
    audioBRef.current = b;

    return () => {
      a.removeEventListener('play', enforceSpeedA);
      a.removeEventListener('playing', enforceSpeedA);
      a.removeEventListener('canplay', enforceSpeedA);
      a.removeEventListener('loadedmetadata', enforceSpeedA);

      b.removeEventListener('play', enforceSpeedB);
      b.removeEventListener('playing', enforceSpeedB);
      b.removeEventListener('canplay', enforceSpeedB);
      b.removeEventListener('loadedmetadata', enforceSpeedB);

      a.pause();
      b.pause();
      a.src = '';
      b.src = '';
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Update volume when user changes it
  const setVolume = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    localStorage.setItem('edge_tts_volume', clamped.toString());
    if (audioARef.current) audioARef.current.volume = clamped;
    if (audioBRef.current) audioBRef.current.volume = clamped;
    setSettings(prev => ({ ...prev, volume: clamped }));
  }, []);

  // Set Voice
  const setVoice = useCallback((newVoice: string) => {
    localStorage.setItem('edge_tts_voice', newVoice);
    // Invalidate plan cache so new voice is synthesized
    plansCacheRef.current.clear();
    setSettings(prev => ({ ...prev, voice: newVoice }));
  }, []);

  // Set Pitch
  const setPitch = useCallback((newPitch: number) => {
    const clamped = Math.max(-20, Math.min(20, newPitch));
    localStorage.setItem('edge_tts_pitch', clamped.toString());
    plansCacheRef.current.clear();
    setSettings(prev => ({ ...prev, pitch: clamped }));
  }, []);

  // Set Highlight Mode
  const setHighlightMode = useCallback((mode: 'both' | 'sentence' | 'word' | 'none') => {
    localStorage.setItem('edge_tts_highlight_mode', mode);
    setSettings(prev => ({ ...prev, highlightMode: mode }));
  }, []);

  // Set Auto-scroll Mode
  const setAutoScrollMode = useCallback((mode: 'center' | 'edge' | 'off') => {
    localStorage.setItem('edge_tts_auto_scroll', mode);
    setSettings(prev => ({ ...prev, autoScrollMode: mode }));
  }, []);

  // Set Sync Offset (calibration in ms, e.g. -120ms to compensate for audio latency)
  const setSyncOffset = useCallback((offsetMs: number) => {
    const clamped = Math.max(-300, Math.min(200, offsetMs));
    localStorage.setItem('edge_tts_sync_offset', clamped.toString());
    setSettings(prev => ({ ...prev, syncOffsetMs: clamped }));
  }, []);

  // Toggle or Set Clock Scrubber Option in Player Header
  const setShowClockInBar = useCallback((show: boolean) => {
    localStorage.setItem('edge_tts_show_clock', show ? 'true' : 'false');
    setSettings(prev => ({ ...prev, showClockInBar: show }));
  }, []);

  // Update MediaSession on supported devices
  const updateMediaSession = useCallback((chapter: Chapter, isPlaying: boolean) => {
    if ('mediaSession' in navigator && chapter) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.title || `Chapter ${chapter.number}`,
        artist: novelTitle,
        album: `Edge Read Aloud (${settingsRef.current.voice})`
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [novelTitle]);

  // Smooth auto-scroll helper honoring user autoScrollMode
  const scrollToSentence = useCallback((chapterId: string, pIdx: number, sIdx: number) => {
    const scrollMode = settingsRef.current.autoScrollMode;
    if (scrollMode === 'off') return;

    // CRITICAL: If the user manually scrolled away, do NOT yank or steal the scroll!
    if (isDetachedRef.current) return;

    const elementId = `tts-sent-${chapterId}-${pIdx}-${sIdx}`;
    const el = document.getElementById(elementId);
    if (el) {
      isProgrammaticScrollRef.current = true;
      if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
      programmaticScrollTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 800);

      if (scrollMode === 'center') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (scrollMode === 'edge') {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        if (rect.top < vh * 0.15 || rect.bottom > vh * 0.85) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, []);

  // Re-centers the view onto the currently playing sentence and re-engages auto-scroll
  const recenterOnActiveSentence = useCallback(() => {
    isDetachedRef.current = false;
    setIsDetached(false);
    setDetachedDirection(null);

    const activePos = activePosRef.current;
    if (!activePos) return;

    if (activePos.chapterIndex !== undefined && activePos.chapterIndex !== currentChapterIndexRef.current) {
      if (onChapterChange) {
        onChapterChange(activePos.chapterIndex);
      }
    }

    setTimeout(() => {
      const elementId = `tts-sent-${activePos.chapterId}-${activePos.paragraphIndex}-${activePos.sentenceIndex}`;
      const el = document.getElementById(elementId);
      if (el) {
        isProgrammaticScrollRef.current = true;
        if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
        programmaticScrollTimerRef.current = setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 800);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }, [onChapterChange]);

  // Window scroll listener: detects when user has scrolled the active sentence out of view
  useEffect(() => {
    let scrollRaf: number | null = null;

    const checkVisibility = () => {
      const activePos = activePosRef.current;
      if (!activePos) {
        if (isDetachedRef.current) {
          isDetachedRef.current = false;
          setIsDetached(false);
          setDetachedDirection(null);
        }
        return;
      }

      // If this scroll was triggered programmatically by auto-scroll, don't flag as detached
      if (isProgrammaticScrollRef.current && !userGestureActiveRef.current) {
        return;
      }

      const elementId = `tts-sent-${activePos.chapterId}-${activePos.paragraphIndex}-${activePos.sentenceIndex}`;
      const el = document.getElementById(elementId);
      const vh = window.innerHeight || document.documentElement.clientHeight;

      if (!el) {
        const currChapIdx = currentChapterIndexRef.current;
        const activeChapIdx = activePos.chapterIndex ?? currChapIdx;
        const dir = activeChapIdx < currChapIdx ? 'above' : 'below';
        isDetachedRef.current = true;
        setIsDetached(true);
        setDetachedDirection(dir);
        return;
      }

      const rect = el.getBoundingClientRect();
      // Allow comfortable margin: top ~70px (header/Edge bar), bottom ~70px (controls)
      const isAbove = rect.bottom < 70;
      const isBelow = rect.top > vh - 70;

      if (isAbove || isBelow) {
        if (userGestureActiveRef.current || !isProgrammaticScrollRef.current) {
          isDetachedRef.current = true;
          setIsDetached(true);
          setDetachedDirection(isAbove ? 'above' : 'below');
        }
      } else {
        // Active sentence is back on screen!
        if (isDetachedRef.current) {
          isDetachedRef.current = false;
          setIsDetached(false);
          setDetachedDirection(null);
        }
      }
    };

    const onScroll = () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(checkVisibility);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
    };
  }, []);

  // Fetch or retrieve from cache the Chapter Plan with voice and pitch
  const getChapterPlan = useCallback(async (chapter: Chapter): Promise<TTSChapterPlan> => {
    const cacheKey = `${chapter.id}:${settingsRef.current.voice}:${settingsRef.current.pitch}`;
    if (plansCacheRef.current.has(cacheKey)) {
      return plansCacheRef.current.get(cacheKey)!;
    }

    const pitchStr = `${settingsRef.current.pitch >= 0 ? '+' : ''}${settingsRef.current.pitch}Hz`;
    const res = await fetch('/api/tts/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapter,
        novelId,
        voice: settingsRef.current.voice,
        pitch: pitchStr
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to plan TTS for chapter: ${res.statusText}`);
    }

    const plan: TTSChapterPlan = await res.json();
    plansCacheRef.current.set(cacheKey, plan);
    return plan;
  }, [novelId]);

  // Fetch or retrieve from cache a synthesized chunk
  const getChunkMetadata = useCallback(async (chunkPlan: TTSChunkPlan): Promise<TTSChunkMetadata> => {
    if (chunksCacheRef.current.has(chunkPlan.hash)) {
      return chunksCacheRef.current.get(chunkPlan.hash)!;
    }

    const res = await fetch('/api/tts/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunk: chunkPlan })
    });

    if (!res.ok) {
      throw new Error(`Failed to synthesize chunk: ${res.statusText}`);
    }

    const meta: TTSChunkMetadata = await res.json();
    chunksCacheRef.current.set(chunkPlan.hash, meta);
    return meta;
  }, []);

  // Calculate cumulative sentence index in the current chapter
  const getChapterSentenceIndex = useCallback((
    plan: TTSChapterPlan | null,
    chunkIdx: number,
    sentenceInChunkIdx: number
  ): { currentIdx: number; totalSentences: number } => {
    if (!plan || !plan.chunks || plan.chunks.length === 0) {
      return { currentIdx: 0, totalSentences: 0 };
    }

    let total = 0;
    let current = 0;

    for (let c = 0; c < plan.chunks.length; c++) {
      const cSentencesCount = plan.chunks[c].sentences.length;
      if (c < chunkIdx) {
        current += cSentencesCount;
      } else if (c === chunkIdx) {
        current += Math.max(0, sentenceInChunkIdx);
      }
      total += cSentencesCount;
    }

    return { currentIdx: current, totalSentences: total };
  }, []);

  // 60FPS Sync Loop: reads audio.currentTime and matches to active sentence and word
  const startTrackingLoop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const track = () => {
      const activeAudio = activePlayerRef.current === 'A' ? audioARef.current : audioBRef.current;
      if (!activeAudio || activeAudio.paused || activeAudio.ended) {
        return;
      }

      const rawMs = Math.round(activeAudio.currentTime * 1000);
      const syncOffset = settingsRef.current.syncOffsetMs ?? -120;
      // Compensate for Edge TTS boundary lead-in (120ms) and hardware/audio output latency
      const currentMs = Math.max(0, rawMs + syncOffset);
      const meta = currentChunkMetaRef.current;

      if (meta && meta.sentences && meta.sentences.length > 0) {
        // 1. Locate active sentence
        let foundSentence: TTSSentenceTiming | null = null;
        let sIdxInChunk = -1;

        for (let i = 0; i < meta.sentences.length; i++) {
          const s = meta.sentences[i];
          if (currentMs >= s.startMs && currentMs < s.endMs) {
            foundSentence = s;
            sIdxInChunk = i;
            break;
          }
        }

        if (!foundSentence) {
          if (currentMs < meta.sentences[0].startMs) {
            foundSentence = meta.sentences[0];
            sIdxInChunk = 0;
          } else {
            foundSentence = meta.sentences[meta.sentences.length - 1];
            sIdxInChunk = meta.sentences.length - 1;
          }
        }

        if (foundSentence) {
          // 2. Locate active word within this sentence
          let activeWordIdx = -1;
          let activeWordText = '';

          if (meta.words && meta.words.length > 0) {
            const sWords = meta.words.filter(w =>
              w.paragraphIndex === foundSentence!.paragraphIndex &&
              w.sentenceIndex === foundSentence!.sentenceIndex
            );

            // If current playback hasn't reached the first word in the sentence yet, hold off word highlight
            if (sWords.length > 0 && currentMs < sWords[0].startMs) {
              activeWordIdx = -1;
              activeWordText = '';
            } else {
              for (let wIdx = 0; wIdx < sWords.length; wIdx++) {
                const w = sWords[wIdx];
                const nextW = sWords[wIdx + 1];
                // Keep active until next word starts (or hold until sentence ends)
                const activeUntil = nextW ? nextW.startMs : foundSentence.endMs;
                if (currentMs >= w.startMs && currentMs < activeUntil) {
                  activeWordIdx = w.wordIndex !== undefined ? w.wordIndex : wIdx;
                  activeWordText = w.word;
                  break;
                }
              }
              // If past all words but still within this sentence's bounds, keep the last word active
              if (activeWordIdx === -1 && sWords.length > 0 && currentMs >= sWords[sWords.length - 1].startMs) {
                const lastW = sWords[sWords.length - 1];
                activeWordIdx = lastW.wordIndex !== undefined ? lastW.wordIndex : (sWords.length - 1);
                activeWordText = lastW.word;
              }
            }
          }

          const chapId = chaptersRef.current[currentChapterIndexRef.current]?.id || '';
          const last = activePosRef.current;

          // Check if changed
          if (
            !last ||
            last.paragraphIndex !== foundSentence.paragraphIndex ||
            last.sentenceIndex !== foundSentence.sentenceIndex ||
            last.wordIndex !== activeWordIdx
          ) {
            const newPos: TTSActivePosition = {
              chapterId: chapId,
              chapterIndex: currentChapterIndexRef.current,
              paragraphIndex: foundSentence.paragraphIndex,
              sentenceIndex: foundSentence.sentenceIndex,
              wordIndex: activeWordIdx,
              wordText: activeWordText,
              sentenceText: foundSentence.text
            };

            activePosRef.current = newPos;

            // Calculate chapter-wide sentence progress for scrubber
            const { currentIdx, totalSentences } = getChapterSentenceIndex(
              currentChapterPlanRef.current,
              currentChunkIndexRef.current,
              sIdxInChunk
            );

            setState(prev => ({
              ...prev,
              activePosition: newPos,
              totalSentencesInChapter: totalSentences,
              currentSentenceIndexInChapter: currentIdx
            }));

            // Save persistent position in localStorage
            try {
              localStorage.setItem(
                'edge_tts_last_position',
                JSON.stringify({
                  novelId,
                  chapterIndex: currentChapterIndexRef.current,
                  paragraphIndex: foundSentence.paragraphIndex,
                  sentenceIndex: foundSentence.sentenceIndex,
                  timestamp: Date.now()
                })
              );
            } catch (e) {}

            // Scroll if sentence changed
            if (
              !last ||
              last.paragraphIndex !== foundSentence.paragraphIndex ||
              last.sentenceIndex !== foundSentence.sentenceIndex
            ) {
              scrollToSentence(chapId, foundSentence.paragraphIndex, foundSentence.sentenceIndex);
            }
          }
        }
      }

      if (isPlayingRef.current) {
        animFrameRef.current = requestAnimationFrame(track);
      }
    };

    animFrameRef.current = requestAnimationFrame(track);
  }, [getChapterSentenceIndex, novelId, scrollToSentence]);

  // Preloads the next chunk onto the standby audio player for gapless playback
  const preloadStandbyChunk = useCallback(async (
    nextChunkPlan: TTSChunkPlan | null,
    standbyPlayer: 'A' | 'B'
  ) => {
    if (!nextChunkPlan) return;
    try {
      const standbyAudio = standbyPlayer === 'A' ? audioARef.current : audioBRef.current;
      if (!standbyAudio) return;

      // Synthesize or retrieve metadata
      await getChunkMetadata(nextChunkPlan);

      // Preload audio and maintain desired playback speed
      standbyAudio.src = nextChunkPlan.audioUrl;
      standbyAudio.defaultPlaybackRate = playbackSpeedRef.current;
      standbyAudio.playbackRate = playbackSpeedRef.current;
      standbyAudio.load();
    } catch (e) {
      console.warn('Preload standby chunk error:', e);
    }
  }, [getChunkMetadata]);

  // Core Play Chunk function
  const playChunk = useCallback(async (
    chapterIndex: number,
    chunkIndex: number,
    startOffsetSec: number = 0
  ) => {
    const chaps = chaptersRef.current;
    if (chapterIndex < 0 || chapterIndex >= chaps.length) {
      // Reached the end of the novel! Stop cleanly
      setState(prev => ({
        ...prev,
        isPlaying: false,
        isLoading: false,
        activePosition: null
      }));
      if (audioARef.current) audioARef.current.pause();
      if (audioBRef.current) audioBRef.current.pause();
      return;
    }

    const chapter = chaps[chapterIndex];
    setState(prev => ({
      ...prev,
      isLoading: true,
      currentChapterId: chapter.id,
      currentChapterIndex: chapterIndex,
      currentChunkIndex: chunkIndex,
      error: null
    }));

    try {
      const plan = await getChapterPlan(chapter);
      currentChapterPlanRef.current = plan;

      const { totalSentences } = getChapterSentenceIndex(plan, chunkIndex, 0);

      setState(prev => ({
        ...prev,
        totalChunks: plan.totalChunks,
        totalSentencesInChapter: totalSentences
      }));

      if (chunkIndex < 0 || chunkIndex >= plan.chunks.length) {
        // Move to next chapter if available
        if (chapterIndex + 1 < chaps.length) {
          if (onChapterChange) onChapterChange(chapterIndex + 1);
          playChunk(chapterIndex + 1, 0, 0);
        } else {
          // Finished novel!
          setState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
        }
        return;
      }

      const chunkPlan = plan.chunks[chunkIndex];
      const meta = await getChunkMetadata(chunkPlan);
      currentChunkMetaRef.current = meta;

      // Select active player
      const activeAudio = activePlayerRef.current === 'A' ? audioARef.current : audioBRef.current;
      const standbyPlayer = activePlayerRef.current === 'A' ? 'B' : 'A';
      const standbyAudio = activePlayerRef.current === 'A' ? audioBRef.current : audioARef.current;
      if (!activeAudio) return;

      // Silence & reset the standby player immediately to prevent any overlapping audio or dual playback
      if (standbyAudio) {
        standbyAudio.pause();
        standbyAudio.currentTime = 0;
        standbyAudio.onended = null;
      }

      // Set audio source
      if (activeAudio.src !== window.location.origin + meta.audioUrl && !activeAudio.src.endsWith(meta.audioUrl)) {
        activeAudio.src = meta.audioUrl;
      }

      const targetSpeed = playbackSpeedRef.current;
      activeAudio.defaultPlaybackRate = targetSpeed;
      activeAudio.playbackRate = targetSpeed;
      activeAudio.volume = settingsRef.current.volume;
      if (startOffsetSec > 0) {
        activeAudio.currentTime = startOffsetSec;
      }

      await activeAudio.play();
      // Re-enforce playback rate after play() in case browser reset it during media decoding
      activeAudio.defaultPlaybackRate = targetSpeed;
      activeAudio.playbackRate = targetSpeed;

      setState(prev => ({
        ...prev,
        isPlaying: true,
        isLoading: false,
        isActive: true
      }));

      updateMediaSession(chapter, true);
      startTrackingLoop();

      // Lookahead: Preload next chunk in standby player for gapless playback
      const nextChunkIdx = chunkIndex + 1;
      if (nextChunkIdx < plan.chunks.length) {
        preloadStandbyChunk(plan.chunks[nextChunkIdx], standbyPlayer);
      } else if (chapterIndex + 1 < chaps.length) {
        // Preload first chunk of NEXT chapter!
        getChapterPlan(chaps[chapterIndex + 1]).then(nextPlan => {
          if (nextPlan.chunks.length > 0) {
            preloadStandbyChunk(nextPlan.chunks[0], standbyPlayer);
          }
        }).catch(() => {});
      }

      // Attach onended handler to automatically transition
      activeAudio.onended = () => {
        activeAudio.onended = null;
        // Check sleep timer for "End of Chapter" mode (-1)
        if (sleepTimerMinRef.current === -1 && nextChunkIdx >= plan.chunks.length) {
          // Sleep timer satisfied!
          setSleepTimerMinutes(null);
          setSleepTimerRemainingSec(null);
          setState(prev => ({
            ...prev,
            isPlaying: false,
            isLoading: false,
            activePosition: null
          }));
          return;
        }

        // Ping-pong switch to standby player for gapless continuity
        activePlayerRef.current = standbyPlayer;

        if (nextChunkIdx < plan.chunks.length) {
          if (playChunkRef.current) {
            playChunkRef.current(chapterIndex, nextChunkIdx, 0);
          } else {
            playChunk(chapterIndex, nextChunkIdx, 0);
          }
        } else if (chapterIndex + 1 < chaps.length) {
          // Automatically advance to next chapter (Continuous Mode)
          if (onChapterChange) onChapterChange(chapterIndex + 1);
          if (playChunkRef.current) {
            playChunkRef.current(chapterIndex + 1, 0, 0);
          } else {
            playChunk(chapterIndex + 1, 0, 0);
          }
        } else {
          // End of novel reached
          setState(prev => ({ ...prev, isPlaying: false, isLoading: false, activePosition: null }));
        }
      };

    } catch (err: any) {
      console.error('TTS playback error:', err);
      setState(prev => ({
        ...prev,
        isPlaying: false,
        isLoading: false,
        error: err.message || 'Failed to play audio'
      }));
    }
  }, [getChapterPlan, getChapterSentenceIndex, getChunkMetadata, preloadStandbyChunk, startTrackingLoop, updateMediaSession, onChapterChange]);

  playChunkRef.current = playChunk;

  // Tap-to-Seek Handler: jumps to the exact sentence clicked anywhere in the novel
  const seekToSentence = useCallback(async (
    targetChapterId: string,
    targetChapterIndex: number,
    targetParagraphIndex: number,
    targetSentenceIndex: number
  ) => {
    isDetachedRef.current = false;
    setIsDetached(false);
    setDetachedDirection(null);

    const chaps = chaptersRef.current;
    let chapIdx = targetChapterIndex;
    if (chapIdx < 0 || chapIdx >= chaps.length || chaps[chapIdx]?.id !== targetChapterId) {
      chapIdx = chaps.findIndex(c => c.id === targetChapterId);
    }
    if (chapIdx === -1) return;

    const chapter = chaps[chapIdx];
    setState(prev => ({ ...prev, isLoading: true, isActive: true }));

    try {
      const plan = await getChapterPlan(chapter);
      currentChapterPlanRef.current = plan;

      // Find which chunk contains this (paragraphIndex, sentenceIndex)
      let foundChunkIdx = 0;
      for (let cIdx = 0; cIdx < plan.chunks.length; cIdx++) {
        const c = plan.chunks[cIdx];
        const match = c.sentences.find(s =>
          s.paragraphIndex === targetParagraphIndex &&
          s.sentenceIndex === targetSentenceIndex
        );
        if (match) {
          foundChunkIdx = cIdx;
          break;
        }
      }

      // Check if this chunk is already currently loaded
      const isCurrentChunk =
        state.currentChapterIndex === chapIdx &&
        state.currentChunkIndex === foundChunkIdx &&
        currentChunkMetaRef.current;

      // If user taps or touches the sentence that is ALREADY currently playing, do NOT reset currentTime
      // This prevents the audio stutter/loop bug when scrolling or touching active sentences
      if (
        isCurrentChunk &&
        activePosRef.current &&
        activePosRef.current.paragraphIndex === targetParagraphIndex &&
        activePosRef.current.sentenceIndex === targetSentenceIndex &&
        state.isPlaying
      ) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      if (!isCurrentChunk) {
        // Stop current audio while loading target chunk to prevent old audio continuing to play
        const curAudio = activePlayerRef.current === 'A' ? audioARef.current : audioBRef.current;
        if (curAudio) curAudio.pause();
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      }

      if (isCurrentChunk) {
        const activeAudio = activePlayerRef.current === 'A' ? audioARef.current : audioBRef.current;
        const meta = currentChunkMetaRef.current!;
        const matchingSentence = meta.sentences.find(s =>
          s.paragraphIndex === targetParagraphIndex &&
          s.sentenceIndex === targetSentenceIndex
        );

        const seekSec = matchingSentence ? Math.max(0, matchingSentence.startMs / 1000) : 0;
        if (activeAudio) {
          activeAudio.currentTime = seekSec;
          const targetSpeed = playbackSpeedRef.current;
          activeAudio.defaultPlaybackRate = targetSpeed;
          activeAudio.playbackRate = targetSpeed;
          activeAudio.volume = settingsRef.current.volume;
          if (activeAudio.paused) {
            await activeAudio.play();
            activeAudio.defaultPlaybackRate = targetSpeed;
            activeAudio.playbackRate = targetSpeed;
            setState(prev => ({ ...prev, isPlaying: true, isLoading: false }));
            startTrackingLoop();
          } else {
            setState(prev => ({ ...prev, isLoading: false }));
          }
        }
      } else {
        // Need to load and play that target chunk
        const targetChunkPlan = plan.chunks[foundChunkIdx];
        const meta = await getChunkMetadata(targetChunkPlan);
        const matchingSentence = meta.sentences.find(s =>
          s.paragraphIndex === targetParagraphIndex &&
          s.sentenceIndex === targetSentenceIndex
        );
        const seekSec = matchingSentence ? Math.max(0, matchingSentence.startMs / 1000) : 0;

        await playChunk(chapIdx, foundChunkIdx, seekSec);
      }
    } catch (err: any) {
      console.error('Seek to sentence error:', err);
      setState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  }, [getChapterPlan, getChunkMetadata, playChunk, startTrackingLoop, state.currentChapterIndex, state.currentChunkIndex, state.playbackSpeed]);

  // Jump to an arbitrary sentence index in the current chapter via scrubber
  const seekToChapterSentence = useCallback(async (targetSentenceIdx: number) => {
    isDetachedRef.current = false;
    setIsDetached(false);
    setDetachedDirection(null);

    const chapIdx = state.currentChapterIndex;
    const chaps = chaptersRef.current;
    if (chapIdx < 0 || chapIdx >= chaps.length) return;

    const chapter = chaps[chapIdx];
    try {
      const plan = await getChapterPlan(chapter);
      currentChapterPlanRef.current = plan;

      let accumulated = 0;
      let targetChunkIdx = 0;
      let sentenceInChunk = 0;

      for (let c = 0; c < plan.chunks.length; c++) {
        const count = plan.chunks[c].sentences.length;
        if (targetSentenceIdx < accumulated + count) {
          targetChunkIdx = c;
          sentenceInChunk = targetSentenceIdx - accumulated;
          break;
        }
        accumulated += count;
        if (c === plan.chunks.length - 1) {
          targetChunkIdx = c;
          sentenceInChunk = count - 1;
        }
      }

      const chunkPlan = plan.chunks[targetChunkIdx];
      const targetSentence = chunkPlan.sentences[sentenceInChunk];
      if (targetSentence) {
        await seekToSentence(
          chapter.id,
          chapIdx,
          targetSentence.paragraphIndex,
          targetSentence.sentenceIndex
        );
      }
    } catch (e) {
      console.error('Failed to seek to chapter sentence:', e);
    }
  }, [getChapterPlan, seekToSentence, state.currentChapterIndex]);

  // Global listener for 'tts-seek-to' custom event from reader
  useEffect(() => {
    const handleGlobalSeek = (e: any) => {
      const detail = e.detail;
      if (detail && detail.chapterId) {
        seekToSentence(
          detail.chapterId,
          detail.chapterIndex,
          detail.paragraphIndex,
          detail.sentenceIndex
        );
      }
    };

    window.addEventListener('tts-seek-to', handleGlobalSeek);
    return () => {
      window.removeEventListener('tts-seek-to', handleGlobalSeek);
    };
  }, [seekToSentence]);

  // Play / Pause toggle
  const togglePlayPause = useCallback(async () => {
    const activeAudio = activePlayerRef.current === 'A' ? audioARef.current : audioBRef.current;

    if (state.isPlaying) {
      if (activeAudio) activeAudio.pause();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setState(prev => ({ ...prev, isPlaying: false }));
      const chap = chaptersRef.current[state.currentChapterIndex];
      if (chap) updateMediaSession(chap, false);
    } else {
      // Start or resume
      if (activeAudio && activeAudio.src && activeAudio.currentTime > 0) {
        const targetSpeed = playbackSpeedRef.current;
        activeAudio.defaultPlaybackRate = targetSpeed;
        activeAudio.playbackRate = targetSpeed;
        activeAudio.volume = settingsRef.current.volume;
        await activeAudio.play();
        activeAudio.defaultPlaybackRate = targetSpeed;
        activeAudio.playbackRate = targetSpeed;
        setState(prev => ({ ...prev, isPlaying: true, isActive: true }));
        startTrackingLoop();
        const chap = chaptersRef.current[state.currentChapterIndex];
        if (chap) updateMediaSession(chap, true);
      } else {
        // Start from current chapter and active position or beginning
        const chapIdx = state.currentChapterIndex || currentChapterIndex;
        playChunk(chapIdx, 0, 0);
      }
    }
  }, [currentChapterIndex, playChunk, startTrackingLoop, state.currentChapterIndex, state.isPlaying, updateMediaSession]);

  // Next Sentence
  const nextSentence = useCallback(() => {
    isDetachedRef.current = false;
    setIsDetached(false);
    setDetachedDirection(null);

    const meta = currentChunkMetaRef.current;
    const activePos = activePosRef.current;
    if (!meta || !activePos) return;

    const currentSentIdx = meta.sentences.findIndex(s =>
      s.paragraphIndex === activePos.paragraphIndex &&
      s.sentenceIndex === activePos.sentenceIndex
    );

    if (currentSentIdx !== -1 && currentSentIdx + 1 < meta.sentences.length) {
      const nextS = meta.sentences[currentSentIdx + 1];
      const activeAudio = activePlayerRef.current === 'A' ? audioARef.current : audioBRef.current;
      if (activeAudio) {
        activeAudio.currentTime = Math.max(0, nextS.startMs / 1000);
      }
    } else {
      // Move to next chunk
      playChunk(state.currentChapterIndex, state.currentChunkIndex + 1, 0);
    }
  }, [playChunk, state.currentChapterIndex, state.currentChunkIndex]);

  // Previous Sentence
  const prevSentence = useCallback(() => {
    isDetachedRef.current = false;
    setIsDetached(false);
    setDetachedDirection(null);

    const meta = currentChunkMetaRef.current;
    const activePos = activePosRef.current;
    const activeAudio = activePlayerRef.current === 'A' ? audioARef.current : audioBRef.current;
    if (!meta || !activePos || !activeAudio) return;

    const currentSentIdx = meta.sentences.findIndex(s =>
      s.paragraphIndex === activePos.paragraphIndex &&
      s.sentenceIndex === activePos.sentenceIndex
    );

    // If more than 1.5s into current sentence, restart current sentence
    const currentSentence = meta.sentences[currentSentIdx];
    const sentenceStartSec = currentSentence ? currentSentence.startMs / 1000 : 0;
    if (activeAudio.currentTime - sentenceStartSec > 1.5) {
      activeAudio.currentTime = sentenceStartSec;
      return;
    }

    if (currentSentIdx > 0) {
      const prevS = meta.sentences[currentSentIdx - 1];
      activeAudio.currentTime = Math.max(0, prevS.startMs / 1000);
    } else if (state.currentChunkIndex > 0) {
      // Move to previous chunk
      playChunk(state.currentChapterIndex, state.currentChunkIndex - 1, 0);
    }
  }, [playChunk, state.currentChapterIndex, state.currentChunkIndex]);

  // Change Playback Speed
  const setPlaybackSpeed = useCallback((newSpeed: number) => {
    localStorage.setItem('edge_tts_playback_speed', newSpeed.toString());
    playbackSpeedRef.current = newSpeed;
    if (audioARef.current) {
      audioARef.current.defaultPlaybackRate = newSpeed;
      audioARef.current.playbackRate = newSpeed;
    }
    if (audioBRef.current) {
      audioBRef.current.defaultPlaybackRate = newSpeed;
      audioBRef.current.playbackRate = newSpeed;
    }
    setState(prev => ({ ...prev, playbackSpeed: newSpeed }));
  }, []);

  // Cycle speed to next option
  const cyclePlaybackSpeed = useCallback(() => {
    const currentIdx = SPEED_OPTIONS.indexOf(state.playbackSpeed);
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
    setPlaybackSpeed(SPEED_OPTIONS[nextIdx]);
  }, [SPEED_OPTIONS, setPlaybackSpeed, state.playbackSpeed]);

  // Stop & Close Read Aloud
  const stopReadAloud = useCallback(() => {
    isDetachedRef.current = false;
    setIsDetached(false);
    setDetachedDirection(null);

    if (audioARef.current) {
      audioARef.current.pause();
      audioARef.current.currentTime = 0;
      audioARef.current.volume = settingsRef.current.volume;
    }
    if (audioBRef.current) {
      audioBRef.current.pause();
      audioBRef.current.currentTime = 0;
      audioBRef.current.volume = settingsRef.current.volume;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }

    setState(prev => ({
      ...prev,
      isActive: false,
      isPlaying: false,
      activePosition: null
    }));
  }, []);

  // Sleep Timer Handler
  const setSleepTimer = useCallback((minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (minutes === null || minutes === -1) {
      setSleepTimerRemainingSec(null);
      setIsFadingOut(false);
      if (audioARef.current) audioARef.current.volume = settingsRef.current.volume;
      if (audioBRef.current) audioBRef.current.volume = settingsRef.current.volume;
    } else {
      setSleepTimerRemainingSec(minutes * 60);
      setIsFadingOut(false);
    }
  }, []);

  // Sleep Timer Countdown Loop
  useEffect(() => {
    if (!state.isPlaying || sleepTimerRemainingSec === null) return;

    if (sleepTimerRemainingSec <= 0) {
      // Time is up! Pause playback and reset volume
      if (audioARef.current) {
        audioARef.current.pause();
        audioARef.current.volume = settingsRef.current.volume;
      }
      if (audioBRef.current) {
        audioBRef.current.pause();
        audioBRef.current.volume = settingsRef.current.volume;
      }
      setState(prev => ({ ...prev, isPlaying: false }));
      setSleepTimerMinutes(null);
      setSleepTimerRemainingSec(null);
      setIsFadingOut(false);
      return;
    }

    const interval = setInterval(() => {
      setSleepTimerRemainingSec(prev => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        const next = prev - 1;
        // In the final 15 seconds, smoothly fade out volume
        if (next <= 15) {
          setIsFadingOut(true);
          const ratio = Math.max(0, next / 15);
          const fadedVolume = settingsRef.current.volume * ratio;
          if (audioARef.current) audioARef.current.volume = fadedVolume;
          if (audioBRef.current) audioBRef.current.volume = fadedVolume;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerRemainingSec, state.isPlaying]);

  // Preload a chapter's chunks into server cache
  const preloadChapter = useCallback(async (chapterIndex: number): Promise<number> => {
    const chaps = chaptersRef.current;
    if (chapterIndex < 0 || chapterIndex >= chaps.length) return 0;

    const chapter = chaps[chapterIndex];
    try {
      const plan = await getChapterPlan(chapter);
      const uncachedChunks = plan.chunks.filter(c => !c.isCached);
      if (uncachedChunks.length > 0) {
        await fetch('/api/tts/preload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunks: uncachedChunks })
        });
      }
      return plan.chunks.length;
    } catch (e) {
      console.warn(`Failed to preload chapter ${chapterIndex}:`, e);
      return 0;
    }
  }, [getChapterPlan]);

  // Preload next N chapters in background
  const preloadNextChapters = useCallback(async (count: number = 3): Promise<number> => {
    const currentIndex = state.currentChapterIndex;
    let totalScheduled = 0;
    for (let i = 1; i <= count; i++) {
      const targetIdx = currentIndex + i;
      if (targetIdx < chaptersRef.current.length) {
        const scheduled = await preloadChapter(targetIdx);
        totalScheduled += scheduled;
      }
    }
    return totalScheduled;
  }, [preloadChapter, state.currentChapterIndex]);

  // Clear TTS Cache
  const clearCache = useCallback(async (): Promise<{ success: boolean; removedFiles: number; freedBytes: number }> => {
    try {
      const res = await fetch('/api/tts/cache/clear', { method: 'POST' });
      const data = await res.json();
      plansCacheRef.current.clear();
      chunksCacheRef.current.clear();
      return data;
    } catch (e: any) {
      return { success: false, removedFiles: 0, freedBytes: 0 };
    }
  }, []);

  // Fetch TTS Cache Stats
  const getCacheStats = useCallback(async (): Promise<TTSCacheStats> => {
    try {
      const res = await fetch('/api/tts/stats');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return { audioFiles: 0, totalSizeBytes: 0 };
  }, []);

  // Retrieve last saved position from localStorage
  const getLastSavedPosition = useCallback(() => {
    try {
      const saved = localStorage.getItem('edge_tts_last_position');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.chapterIndex !== undefined && parsed.sentenceIndex !== undefined) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }, []);

  // Resume playback from last saved position
  const resumeLastPosition = useCallback(() => {
    const pos = getLastSavedPosition();
    if (pos) {
      const chap = chaptersRef.current[pos.chapterIndex];
      if (chap) {
        seekToSentence(chap.id, pos.chapterIndex, pos.paragraphIndex, pos.sentenceIndex);
      }
    }
  }, [getLastSavedPosition, seekToSentence]);

  // Hook MediaSession action handlers
  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
        navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextSentence());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevSentence());
        navigator.mediaSession.setActionHandler('stop', () => stopReadAloud());
      } catch (e) {}
    }
  }, [nextSentence, prevSentence, stopReadAloud, togglePlayPause]);

  return {
    state,
    SPEED_OPTIONS,
    settings,
    togglePlayPause,
    seekToSentence,
    seekToChapterSentence,
    nextSentence,
    prevSentence,
    setPlaybackSpeed,
    cyclePlaybackSpeed,
    stopReadAloud,
    // Part 4 additions
    setVoice,
    setPitch,
    setHighlightMode,
    setAutoScrollMode,
    setVolume,
    setSyncOffset,
    setShowClockInBar,
    setSleepTimer,
    preloadChapter,
    preloadNextChapters,
    clearCache,
    getCacheStats,
    getLastSavedPosition,
    resumeLastPosition,
    // Detached scroll state & recenter control
    isDetached,
    detachedDirection,
    recenterOnActiveSentence
  };
}
