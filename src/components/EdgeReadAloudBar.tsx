import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sliders,
  Moon,
  Clock,
  User,
  Minimize2,
  Maximize2,
  Crosshair
} from 'lucide-react';
import { EdgeReadAloudState } from '../types/tts';

interface EdgeReadAloudBarProps {
  state: EdgeReadAloudState;
  speedOptions: number[];
  currentTheme: {
    bg: string;
    text: string;
    border: string;
    accent: string;
    cardBg?: string;
    sidebarBg?: string;
  };
  chapterTitle?: string;
  onTogglePlayPause: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onSetSpeed: (speed: number) => void;
  onClose: () => void;
  onOpenVoiceOptions: () => void;
  onSeekToChapterSentence?: (sentenceIndex: number) => void;
  isDetached?: boolean;
  onRecenter?: () => void;
}

export const EdgeReadAloudBar: React.FC<EdgeReadAloudBarProps> = ({
  state,
  speedOptions,
  currentTheme,
  chapterTitle,
  onTogglePlayPause,
  onPrevSentence,
  onNextSentence,
  onSetSpeed,
  onClose,
  onOpenVoiceOptions,
  onSeekToChapterSentence,
  isDetached = false,
  onRecenter
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showTimelineScrubber, setShowTimelineScrubber] = useState(false);
  const showClockInBar = state.settings?.showClockInBar ?? (localStorage.getItem('edge_tts_show_clock') !== 'false');
  // Allows user to minimize/hide the bar so it never obstructs reading or headers
  const [isMinimized, setIsMinimized] = useState(() => {
    return localStorage.getItem('edge_tts_bar_minimized') === 'true';
  });

  // Draggable position state for Edge Bar (coordinates from top-left)
  const getInitialBarPosition = (): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x: 50, y: 12 };
    const initialMin = localStorage.getItem('edge_tts_bar_minimized') === 'true';
    const estimatedW = initialMin ? 180 : Math.min(window.innerWidth - 16, 380);
    try {
      const saved = localStorage.getItem('edge_tts_bar_position');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return {
            x: Math.min(Math.max(8, parsed.x), Math.max(8, window.innerWidth - estimatedW - 8)),
            y: Math.min(Math.max(8, parsed.y), Math.max(8, window.innerHeight - 60))
          };
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved bar position', e);
    }
    const defaultX = Math.max(8, window.innerWidth - estimatedW - 12);
    return { x: defaultX, y: 12 };
  };

  const [barPosition, setBarPosition] = useState<{ x: number; y: number }>(getInitialBarPosition);
  const [isBarDragging, setIsBarDragging] = useState(false);
  const barCurrentPosRef = useRef<{ x: number; y: number }>(barPosition);
  barCurrentPosRef.current = barPosition;

  const barDragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialBarX: number;
    initialBarY: number;
    hasMoved: boolean;
    rafId: number | null;
    latestTargetX: number;
    latestTargetY: number;
  } | null>(null);

  const barAsideRef = useRef<HTMLElement | null>(null);

  // Smoothly toggle minimize/expand with smart anchoring (keeps right-anchored bars pinned to the right edge)
  const toggleMinimize = useCallback((targetMin: boolean) => {
    setBarPosition(prev => {
      const barEl = barAsideRef.current;
      const currentW = barEl?.offsetWidth || (isMinimized ? 180 : 380);
      const targetW = targetMin ? 180 : Math.min(window.innerWidth - 16, 380);
      const isRightHalf = (prev.x + currentW / 2) >= (window.innerWidth / 2);

      let newX: number;
      if (isRightHalf) {
        // Anchor to the right edge so expanding grows inwards to the left, never off-screen
        const rightEdge = prev.x + currentW;
        newX = rightEdge - targetW;
      } else {
        // Anchor to the left edge
        newX = prev.x;
      }

      // Strict clamping to keep within viewport
      const maxAllowedX = Math.max(8, window.innerWidth - targetW - 8);
      const clampedX = Math.max(8, Math.min(newX, maxAllowedX));
      const maxAllowedY = Math.max(8, window.innerHeight - 60);
      const clampedY = Math.max(8, Math.min(prev.y, maxAllowedY));

      const nextPos = { x: clampedX, y: clampedY };
      try {
        localStorage.setItem('edge_tts_bar_position', JSON.stringify(nextPos));
      } catch {}
      return nextPos;
    });

    setIsMinimized(targetMin);
    localStorage.setItem('edge_tts_bar_minimized', targetMin ? 'true' : 'false');
  }, [isMinimized]);

  // Sync style transform when barPosition changes and not dragging
  useEffect(() => {
    if (barAsideRef.current && !barDragSessionRef.current) {
      barAsideRef.current.style.transform = `translate3d(${barPosition.x}px, ${barPosition.y}px, 0)`;
    }
  }, [barPosition.x, barPosition.y]);

  // Keep bar strictly within screen on resize or mode change
  useEffect(() => {
    const clampCurrentPosition = () => {
      setBarPosition(prev => {
        const currentW = barAsideRef.current?.offsetWidth || (isMinimized ? 180 : 380);
        const currentH = barAsideRef.current?.offsetHeight || 50;
        const maxX = Math.max(8, window.innerWidth - currentW - 8);
        const maxY = Math.max(8, window.innerHeight - currentH - 8);
        const clampedX = Math.min(Math.max(8, prev.x), maxX);
        const clampedY = Math.min(Math.max(8, prev.y), maxY);
        if (clampedX !== prev.x || clampedY !== prev.y) {
          const nextPos = { x: clampedX, y: clampedY };
          try {
            localStorage.setItem('edge_tts_bar_position', JSON.stringify(nextPos));
          } catch {}
          return nextPos;
        }
        return prev;
      });
    };

    const timer = setTimeout(clampCurrentPosition, 30);
    window.addEventListener('resize', clampCurrentPosition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', clampCurrentPosition);
    };
  }, [isMinimized]);

  const handleBarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    barDragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialBarX: barCurrentPosRef.current.x,
      initialBarY: barCurrentPosRef.current.y,
      hasMoved: false,
      rafId: null,
      latestTargetX: barCurrentPosRef.current.x,
      latestTargetY: barCurrentPosRef.current.y
    };
  }, []);

  const handleBarPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = barDragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - session.startX;
    const deltaY = e.clientY - session.startY;

    if (!session.hasMoved && Math.hypot(deltaX, deltaY) > 5) {
      session.hasMoved = true;
      setIsBarDragging(true);
    }

    if (session.hasMoved) {
      const barEl = barAsideRef.current;
      const barWidth = barEl ? barEl.offsetWidth : (isMinimized ? 180 : 380);
      const barHeight = barEl ? barEl.offsetHeight : 54;

      const rawX = session.initialBarX + deltaX;
      const rawY = session.initialBarY + deltaY;

      const maxX = Math.max(8, window.innerWidth - barWidth - 8);
      const maxY = Math.max(8, window.innerHeight - barHeight - 8);

      const clampedX = Math.min(Math.max(8, rawX), maxX);
      const clampedY = Math.min(Math.max(8, rawY), maxY);

      session.latestTargetX = clampedX;
      session.latestTargetY = clampedY;

      // 120fps hardware-accelerated direct GPU update via requestAnimationFrame
      if (session.rafId === null) {
        session.rafId = requestAnimationFrame(() => {
          if (barDragSessionRef.current && barAsideRef.current) {
            barAsideRef.current.style.transform = `translate3d(${barDragSessionRef.current.latestTargetX}px, ${barDragSessionRef.current.latestTargetY}px, 0)`;
            barDragSessionRef.current.rafId = null;
          }
        });
      }
    }
  }, []);

  const handleBarPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = barDragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (session.rafId !== null) {
      cancelAnimationFrame(session.rafId);
      session.rafId = null;
    }

    const { hasMoved, latestTargetX, latestTargetY } = session;
    barDragSessionRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    setIsBarDragging(false);

    if (hasMoved) {
      const finalPos = { x: latestTargetX, y: latestTargetY };
      setBarPosition(finalPos);
      try {
        localStorage.setItem('edge_tts_bar_position', JSON.stringify(finalPos));
      } catch (err) {
        console.warn('Failed to save bar position', err);
      }
    }
  }, []);

  // Double click handle to reset position to default top-right
  const handleResetBarPosition = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.removeItem('edge_tts_bar_position');
    const currentW = barAsideRef.current?.offsetWidth || (isMinimized ? 180 : Math.min(window.innerWidth - 16, 380));
    const defaultX = Math.max(8, window.innerWidth - currentW - 12);
    const defaultPos = { x: defaultX, y: 12 };
    setBarPosition(defaultPos);
    if (barAsideRef.current) {
      barAsideRef.current.style.transform = `translate3d(${defaultPos.x}px, ${defaultPos.y}px, 0)`;
    }
  }, [isMinimized]);

  // Keyboard controls for Read Aloud (Spacebar for play/pause, left/right for sentence navigation)
  useEffect(() => {
    if (!state.isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlayPause();
      } else if (e.code === 'ArrowRight' && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        onNextSentence();
      } else if (e.code === 'ArrowLeft' && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        onPrevSentence();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isActive, onTogglePlayPause, onNextSentence, onPrevSentence, onClose]);

  // Extract short voice name for display
  const shortVoiceName = useMemo(() => {
    const full = state.settings?.voice || 'en-US-SteffanNeural';
    if (full.includes('Steffan')) return 'Steffan';
    if (full.includes('Jenny')) return 'Jenny';
    if (full.includes('Guy')) return 'Guy';
    if (full.includes('Aria')) return 'Aria';
    if (full.includes('Ryan')) return 'Ryan';
    if (full.includes('Sonia')) return 'Sonia';
    return 'Neural';
  }, [state.settings?.voice]);

  // Format sleep timer
  const sleepTimerDisplay = useMemo(() => {
    if (state.sleepTimerMinutes === -1) {
      return 'End of Ch.';
    }
    if (state.sleepTimerRemainingSec !== null) {
      const m = Math.floor(state.sleepTimerRemainingSec / 60);
      const s = state.sleepTimerRemainingSec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return null;
  }, [state.sleepTimerMinutes, state.sleepTimerRemainingSec]);

  // Estimated reading time remaining in current chapter
  const estimatedTimeLeft = useMemo(() => {
    const total = state.totalSentencesInChapter || 0;
    const current = state.currentSentenceIndexInChapter || 0;
    const remaining = Math.max(0, total - current);
    if (remaining === 0) return '0 min';

    const speed = state.playbackSpeed || 1.0;
    const sec = Math.round((remaining * 3.6) / speed);
    const min = Math.ceil(sec / 60);
    return `${min} min`;
  }, [state.totalSentencesInChapter, state.currentSentenceIndexInChapter, state.playbackSpeed]);

  if (!state.isActive) {
    return null;
  }

  // 1. MINIMIZED FLOATING BUBBLE (Allows reading without ANY header occlusion)
  const barBg = currentTheme.cardBg || '#181B21';
  const textColor = currentTheme.text || '#E2E8F0';
  const borderColor = currentTheme.border || 'rgba(255, 255, 255, 0.12)';
  const accentColor = currentTheme.accent || '#FF79B0';

  if (isMinimized) {
    return (
      <aside
        ref={barAsideRef}
        aria-label="Read Aloud Mini Player"
        style={{
          transform: `translate3d(${barPosition.x}px, ${barPosition.y}px, 0)`,
          willChange: isBarDragging ? 'transform' : 'auto',
          touchAction: 'none'
        }}
        className="fixed top-0 left-0 z-50 animate-in fade-in zoom-in-95 duration-200 select-none"
      >
        <div
          id="edge-read-aloud-minimized"
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          onPointerCancel={handleBarPointerUp}
          style={{
            backgroundColor: barBg,
            color: textColor,
            borderColor: borderColor
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-2xl border backdrop-blur-xl select-none transition-shadow duration-200 ${
            isBarDragging
              ? 'cursor-grabbing scale-105 shadow-2xl ring-2'
              : 'cursor-grab hover:shadow-xl'
          }`}
          onDoubleClick={handleResetBarPosition}
          title="Hold and drag to reposition (Double-click to reset)"
        >
          {/* Play / Pause Mini button */}
          <button
            onClick={onTogglePlayPause}
            className="w-7 h-7 rounded-full bg-[#2A2F3A] hover:bg-[#353C4A] text-slate-200 flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-md border border-white/10"
            title={state.isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {state.isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : state.isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          {/* Recenter button when scrolled away */}
          {isDetached && onRecenter && (
            <button
              id="tts-bar-minimized-recenter-btn"
              onClick={onRecenter}
              style={{ color: accentColor }}
              className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Return to spoken text"
            >
              <Crosshair className="w-3.5 h-3.5 animate-pulse" />
            </button>
          )}

          {/* Quick Voice & Status indicator */}
          <button
            onClick={() => toggleMinimize(false)}
            className="flex items-center gap-1 text-xs px-1 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            title="Click to expand Edge Read Aloud controls"
          >
            <span className="font-medium text-[11px] truncate max-w-[80px] sm:max-w-[120px]">
              {shortVoiceName} • {state.playbackSpeed}x
            </span>
          </button>

          {/* Expand button */}
          <button
            onClick={() => toggleMinimize(false)}
            className="p-1 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Expand Read Aloud bar"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 rounded-full opacity-60 hover:opacity-100 hover:text-red-400 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Close Read Aloud"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  // 2. EXPANDED MICROSOFT EDGE FLOATING PILL (Matches native Edge Screenshot)
  // Floats at top-right without covering or replacing the novel's original header!
  return (
    <aside
      ref={barAsideRef}
      aria-label="Microsoft Edge Read Aloud Controls"
      style={{
        transform: `translate3d(${barPosition.x}px, ${barPosition.y}px, 0)`,
        willChange: isBarDragging ? 'transform' : 'auto',
        touchAction: 'none'
      }}
      className="fixed top-0 left-0 z-50 select-none animate-in fade-in duration-200"
    >
      <div className="flex flex-col items-end gap-1.5 max-w-[calc(100vw-16px)]">
        {/* The Edge Floating Pill */}
        <div
          id="edge-read-aloud-bar"
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          onPointerCancel={handleBarPointerUp}
          onDoubleClick={handleResetBarPosition}
          title="Hold and drag to move anywhere (Double-click to reset)"
          style={{
            backgroundColor: barBg,
            color: textColor,
            borderColor: borderColor
          }}
          className={`flex items-center gap-0.5 sm:gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-full shadow-2xl border backdrop-blur-xl transition-shadow duration-200 max-w-[calc(100vw-16px)] ${
            isBarDragging
              ? 'cursor-grabbing scale-[1.02] ring-2 shadow-2xl'
              : 'cursor-grab hover:shadow-xl'
          }`}
        >
          {/* Close Button [ X ] */}
          <button
            id="tts-close-bar-btn"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            title="Close Read Aloud (Esc)"
          >
            <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {/* Subtle Vertical Divider */}
          <div className="w-[1px] h-4 opacity-20 bg-current mx-0.5" />

          {/* Previous Sentence Button [ |< ] */}
          <button
            id="tts-prev-sentence-btn"
            onClick={onPrevSentence}
            disabled={state.isLoading}
            className="p-1.5 sm:p-2 rounded-full opacity-80 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 disabled:opacity-30 transition-all cursor-pointer"
            title="Previous Sentence (Ctrl+Left)"
          >
            <SkipBack className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {/* Primary Play / Pause Button [ ▶ / || ] */}
          <button
            id="tts-play-pause-btn"
            onClick={onTogglePlayPause}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#242832] hover:bg-[#2F3542] text-slate-200 border border-white/10 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ring-1 ring-white/5"
            title={state.isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {state.isLoading ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            ) : state.isPlaying ? (
              <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            ) : (
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Next Sentence Button [ >| ] */}
          <button
            id="tts-next-sentence-btn"
            onClick={onNextSentence}
            disabled={state.isLoading}
            className="p-1.5 sm:p-2 rounded-full opacity-80 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 disabled:opacity-30 transition-all cursor-pointer"
            title="Next Sentence (Ctrl+Right)"
          >
            <SkipForward className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {/* Subtle Vertical Divider */}
          <div className="w-[1px] h-4 opacity-20 bg-current mx-0.5" />

          {/* Voice Options Button [ 👤 ] */}
          <button
            id="tts-voice-options-btn"
            onClick={onOpenVoiceOptions}
            className="p-1.5 sm:p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            title="Voice options & Audio Settings"
            aria-label="Voice options"
          >
            <User className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: accentColor }} />
          </button>

          {/* Re-center Button [ Crosshair Return to Reading ] - appears when user scrolled away */}
          {isDetached && onRecenter && (
            <button
              id="tts-bar-recenter-btn"
              onClick={onRecenter}
              style={{ backgroundColor: accentColor }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white active:scale-95 transition-all cursor-pointer shadow-md hover:brightness-110 animate-pulse"
              title="Return to currently spoken sentence"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Center</span>
            </button>
          )}

          {/* Quick Speed Pill Button */}
          <div className="relative">
            <button
              id="tts-speed-btn"
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="flex items-center gap-0.5 px-2.5 py-1 rounded-full text-[11px] font-semibold opacity-80 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer font-mono"
              title="Voice Speed"
            >
              <span>{state.playbackSpeed}x</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {showSpeedMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSpeedMenu(false)}
                />
                <div 
                  style={{
                    backgroundColor: barBg,
                    color: textColor,
                    borderColor: borderColor
                  }}
                  className="absolute right-0 top-full mt-2 z-50 py-1.5 rounded-xl shadow-2xl border min-w-[130px] text-xs animate-in fade-in zoom-in-95 backdrop-blur-xl"
                >
                  <div className="px-3 py-1 text-[10px] uppercase font-bold opacity-50 tracking-wider">
                    Voice Speed
                  </div>
                  {speedOptions.map(spd => (
                    <button
                      key={spd}
                      onClick={() => {
                        onSetSpeed(spd);
                        setShowSpeedMenu(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <span>{spd}x {spd === 1.0 && <span className="text-[10px] opacity-60">(Normal)</span>}</span>
                      {state.playbackSpeed === spd && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sleep Timer Indicator Badge (if running) */}
          {sleepTimerDisplay && (
            <button
              onClick={onOpenVoiceOptions}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono border transition-all cursor-pointer ${
                state.isFadingOut
                  ? 'border-amber-500 bg-amber-500/20 text-amber-400 animate-pulse'
                  : 'border-current/20 bg-black/10 dark:bg-white/10'
              }`}
              style={{ color: state.isFadingOut ? undefined : accentColor }}
              title={state.isFadingOut ? "Sleep timer: Fading out..." : `Sleep timer: ${sleepTimerDisplay}`}
            >
              <Moon className="w-3 h-3" />
              <span>{sleepTimerDisplay}</span>
            </button>
          )}

          {/* Timeline Scrubber Toggle (Clock Option) */}
          {showClockInBar && state.totalSentencesInChapter > 0 && onSeekToChapterSentence && (
            <button
              id="tts-timeline-clock-btn"
              onClick={() => setShowTimelineScrubber(prev => !prev)}
              className="p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title={showTimelineScrubber ? "Hide timeline scrubber" : "Show chapter sentence scrubber"}
              aria-label="Timeline scrubber"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Minimize / Hide Button [ – ] */}
          <button
            onClick={() => toggleMinimize(true)}
            className="p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Minimize Read Aloud bar to bubble"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Optional Dropdown Timeline Scrubber Tray */}
        {showClockInBar && showTimelineScrubber && state.totalSentencesInChapter > 0 && onSeekToChapterSentence && (
          <div 
            style={{
              backgroundColor: barBg,
              color: textColor,
              borderColor: borderColor
            }}
            className="w-[300px] sm:w-[360px] max-w-[calc(100vw-16px)] px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-xl text-xs flex flex-col gap-1.5 animate-in slide-in-from-top-1"
          >
            <div className="flex items-center justify-between text-[11px] opacity-80">
              <span className="truncate max-w-[180px] font-medium">
                {chapterTitle || `Chapter ${state.currentChapterIndex + 1}`}
              </span>
              <span className="font-mono font-bold" style={{ color: accentColor }}>
                {state.currentSentenceIndexInChapter + 1} / {state.totalSentencesInChapter}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max={Math.max(1, state.totalSentencesInChapter - 1)}
              value={state.currentSentenceIndexInChapter}
              onChange={e => onSeekToChapterSentence(parseInt(e.target.value, 10))}
              style={{ accentColor: accentColor }}
              className="w-full h-1.5 bg-black/20 dark:bg-white/20 rounded-lg appearance-none cursor-pointer"
            />

            <div className="flex items-center justify-between text-[10px] opacity-60">
              <span>~{estimatedTimeLeft} remaining</span>
              <span>{Math.round(((state.currentSentenceIndexInChapter + 1) / state.totalSentencesInChapter) * 100)}%</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
