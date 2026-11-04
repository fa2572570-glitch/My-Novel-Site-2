import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Mic,
  Sliders,
  Moon,
  HardDrive,
  DownloadCloud,
  Trash2,
  Check,
  Eye,
  Sparkles,
  Info,
  Clock,
  RotateCcw,
  Play,
  Download,
  AlertCircle,
  Headphones,
  Radio,
  FileText
} from 'lucide-react';
import { EdgeReadAloudSettings, TTSCacheStats } from '../types/tts';
import { useOfflineAudio } from '../hooks/useOfflineAudio';
import { OfflineChapterRecord } from '../utils/offlineAudioStorage';

interface VoiceOption {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  locale: string;
  accent: string;
  description: string;
  isDefault?: boolean;
}

const AVAILABLE_VOICES: VoiceOption[] = [
  {
    id: 'en-US-SteffanNeural',
    name: 'Steffan (Natural)',
    gender: 'Male',
    locale: 'en-US',
    accent: 'American',
    description: 'Deep, articulate and natural novel narrator. Optimal pacing.',
    isDefault: true
  },
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny (Natural)',
    gender: 'Female',
    locale: 'en-US',
    accent: 'American',
    description: 'Expressive, clear, and warm conversational storytelling voice.'
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Guy (Natural)',
    gender: 'Male',
    locale: 'en-US',
    accent: 'American',
    description: 'Crisp, resonant, dynamic male voice for dialogue and action.'
  },
  {
    id: 'en-US-AriaNeural',
    name: 'Aria (Natural)',
    gender: 'Female',
    locale: 'en-US',
    accent: 'American',
    description: 'Fluent, versatile, engaging female narrator.'
  },
  {
    id: 'en-GB-RyanNeural',
    name: 'Ryan (Natural)',
    gender: 'Male',
    locale: 'en-GB',
    accent: 'British',
    description: 'Distinguished British English storytelling with classical cadence.'
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'Sonia (Natural)',
    gender: 'Female',
    locale: 'en-GB',
    accent: 'British',
    description: 'Calm, gentle British narration voice for focused reading.'
  }
];

interface EdgeVoiceOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EdgeReadAloudSettings;
  sleepTimerMinutes: number | null;
  sleepTimerRemainingSec: number | null;
  currentChapterIndex: number;
  currentTheme?: {
    bg: string;
    text: string;
    border: string;
    accent: string;
    cardBg?: string;
    secondaryText?: string;
  };
  chapters?: Array<{
    id: string;
    number: number;
    title: string;
    content: string[];
  }>;
  novelId?: string;
  novelTitle?: string;
  onPlayChapter?: (index: number) => void;
  onSetVoice: (voice: string) => void;
  onSetPitch: (pitch: number) => void;
  onSetHighlightMode: (mode: 'both' | 'sentence' | 'word' | 'none') => void;
  onSetAutoScrollMode: (mode: 'center' | 'edge' | 'off') => void;
  onSetVolume: (volume: number) => void;
  onSetSleepTimer: (minutes: number | null) => void;
  onPreloadChapter: (chapterIndex: number) => Promise<number>;
  onPreloadNextChapters: (count: number) => Promise<number>;
  onClearCache: () => Promise<{ success: boolean; removedFiles: number; freedBytes: number }>;
  onGetCacheStats: () => Promise<TTSCacheStats>;
  onSetSyncOffset?: (offsetMs: number) => void;
  onSetShowClockInBar?: (show: boolean) => void;
}

export function EdgeVoiceOptionsModal({
  isOpen,
  onClose,
  settings,
  sleepTimerMinutes,
  sleepTimerRemainingSec,
  currentChapterIndex,
  currentTheme,
  chapters = [],
  novelId = 'novel',
  novelTitle = 'Web Novel',
  onPlayChapter,
  onSetVoice,
  onSetPitch,
  onSetHighlightMode,
  onSetAutoScrollMode,
  onSetVolume,
  onSetSleepTimer,
  onPreloadChapter,
  onPreloadNextChapters,
  onClearCache,
  onGetCacheStats,
  onSetSyncOffset,
  onSetShowClockInBar
}: EdgeVoiceOptionsModalProps) {
  const [cacheStats, setCacheStats] = useState<TTSCacheStats>({ audioFiles: 0, totalSizeBytes: 0 });
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadStatus, setPreloadStatus] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [confirmClearPrompt, setConfirmClearPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<'voice' | 'offline' | 'display' | 'timer' | 'cache'>('voice');
  const [localPitch, setLocalPitch] = useState<number>(settings.pitch ?? 0);

  // Offline Audio Hook & States
  const {
    offlineChapters,
    storageUsage,
    downloadProgress,
    downloadChapterRange,
    exportChapterMP3,
    deleteChapter,
    clearAllChapters,
    cancelDownload,
    refreshOfflineLibrary
  } = useOfflineAudio(novelId);

  const [downloadScope, setDownloadScope] = useState<'current' | 'next5' | 'next10' | 'range'>('current');
  const [rangeStart, setRangeStart] = useState<number>(currentChapterIndex + 1);
  const [rangeEnd, setRangeEnd] = useState<number>(Math.min(chapters?.length || 1, currentChapterIndex + 5));
  const [confirmClearOffline, setConfirmClearOffline] = useState(false);
  const [offlineActionMsg, setOfflineActionMsg] = useState<string | null>(null);
  const [isExportingMP3Id, setIsExportingMP3Id] = useState<string | null>(null);

  // Keep range inputs synced when current chapter changes
  useEffect(() => {
    setRangeStart(currentChapterIndex + 1);
    setRangeEnd(Math.min(chapters?.length || 1, currentChapterIndex + 5));
  }, [currentChapterIndex, chapters?.length]);

  // Sync local pitch when settings change
  useEffect(() => {
    setLocalPitch(settings.pitch ?? 0);
  }, [settings.pitch]);

  // Load cache stats on open
  useEffect(() => {
    if (isOpen) {
      onGetCacheStats().then(setCacheStats).catch(() => {});
    }
  }, [isOpen, onGetCacheStats]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimer = (sec: number | null) => {
    if (sec === null) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePreloadCurrent = async () => {
    setIsPreloading(true);
    setPreloadStatus('Preloading current chapter audio...');
    try {
      const count = await onPreloadChapter(currentChapterIndex);
      setPreloadStatus(`Completed! ${count} chunks queued for instant playback.`);
      const updated = await onGetCacheStats();
      setCacheStats(updated);
    } catch (e: any) {
      setPreloadStatus('Failed to preload current chapter');
    } finally {
      setIsPreloading(false);
      setTimeout(() => setPreloadStatus(null), 4000);
    }
  };

  const handlePreloadNext = async () => {
    setIsPreloading(true);
    setPreloadStatus('Preloading next 3 chapters...');
    try {
      const count = await onPreloadNextChapters(3);
      setPreloadStatus(`Success! Pre-cached ${count} chunks for continuous reading.`);
      const updated = await onGetCacheStats();
      setCacheStats(updated);
    } catch (e: any) {
      setPreloadStatus('Failed to preload upcoming chapters');
    } finally {
      setIsPreloading(false);
      setTimeout(() => setPreloadStatus(null), 4000);
    }
  };

  const handleClear = async () => {
    setIsClearingCache(true);
    setConfirmClearPrompt(false);
    try {
      const res = await onClearCache();
      setCacheStats({ audioFiles: 0, totalSizeBytes: 0 });
      setPreloadStatus(`Cleared ${res.removedFiles} files (${formatBytes(res.freedBytes)})`);
    } catch (e) {
      setPreloadStatus('Failed to clear cache');
    } finally {
      setIsClearingCache(false);
      setTimeout(() => setPreloadStatus(null), 3000);
    }
  };

  const handlePitchChange = (newVal: number) => {
    setLocalPitch(newVal);
    onSetPitch(newVal);
  };

  const handleResetPitch = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setLocalPitch(0);
    onSetPitch(0);
  };

  return (
    <div
      id="voice-options-overlay"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        id="voice-options-modal"
        className="w-full max-w-3xl h-[88vh] max-h-[750px] bg-[#16181D] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 select-none animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER BAR (Identical to TerminologyManagerModal & Reading Settings) */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-[#FF79B0]/20 text-[#FF79B0] border border-[#FF79B0]/30 shadow-sm flex-shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-serif font-bold text-lg sm:text-xl text-white truncate">Voice Options</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] font-mono border border-[#FF79B0]/30 font-extrabold uppercase">
                  Edge Read Aloud
                </span>
              </div>
              <p className="text-xs text-white/50 truncate">Neural narrator selection, pitch calibration, sleep timer & caching</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-all cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TABS BAR (Identical to TerminologyManagerModal tab bar) */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-white/10 bg-white/[0.01] flex items-center justify-between gap-3 flex-shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('voice')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'voice'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice & Pitch</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('offline')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'offline'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>Offline Audio</span>
              {offlineChapters.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                  activeTab === 'offline' ? 'bg-slate-950 text-white' : 'bg-[#FF79B0]/20 text-[#FF79B0]'
                }`}>
                  {offlineChapters.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('display')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'display'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Highlight & Scroll</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('timer')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'timer'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Sleep Timer</span>
              {sleepTimerRemainingSec !== null && (
                <span className="px-1.5 py-0.2 bg-slate-950/40 text-slate-950 font-mono text-[10px] rounded-full font-bold">
                  {formatTimer(sleepTimerRemainingSec)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cache')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'cache'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Cache & Preload</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-white/50 ml-auto flex-shrink-0">
            <span>Voice: <strong className="text-white/90 font-mono text-[11px]">{settings.voice.replace('en-US-', '').replace('en-GB-', '').replace('Neural', '')}</strong></span>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm custom-scrollbar">
          {/* TAB 1: VOICE & PITCH */}
          {activeTab === 'voice' && (
            <div className="space-y-6">
              {/* Voice Cards */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2.5">
                  Available Neural Storytellers
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {AVAILABLE_VOICES.map(voice => {
                    const isSelected = settings.voice === voice.id;
                    return (
                      <div
                        key={voice.id}
                        onClick={() => onSetVoice(voice.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between ${
                          isSelected
                            ? 'bg-[#FF79B0]/15 border-[#FF79B0] shadow-lg ring-1 ring-[#FF79B0]/50'
                            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm">{voice.name}</span>
                            {voice.isDefault && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF79B0]/20 text-[#FF79B0] border border-[#FF79B0]/30">
                                Default
                              </span>
                            )}
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-medium">
                              {voice.accent} ({voice.gender})
                            </span>
                          </div>
                          <p className="text-xs text-white/50 leading-relaxed">{voice.description}</p>
                        </div>
                        <div className="pt-0.5">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                              isSelected
                                ? 'bg-[#FF79B0] border-[#FF79B0] text-slate-950 font-black'
                                : 'border-white/30 text-transparent'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pitch Adjustment Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-white/80">
                      Voice Pitch Calibration
                    </label>
                    <p className="text-xs text-white/50 mt-0.5">
                      Fine-tune narrator vocal frequency deeper or higher
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-[#FF79B0] bg-[#FF79B0]/15 px-2.5 py-1 rounded-lg border border-[#FF79B0]/30">
                      {localPitch === 0 ? 'Normal (0Hz)' : `${localPitch > 0 ? '+' : ''}${localPitch}Hz`}
                    </span>
                    {/* Always visible, robust, highly clickable Reset Button */}
                    <button
                      type="button"
                      id="tts-reset-pitch-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleResetPitch();
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                        localPitch !== 0
                          ? 'bg-[#FF79B0]/20 hover:bg-[#FF79B0]/30 text-[#FF79B0] border-[#FF79B0]/50 shadow-sm'
                          : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70'
                      }`}
                      title="Reset pitch to 0Hz (Normal)"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="1"
                  value={localPitch}
                  onChange={e => handlePitchChange(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF79B0]"
                />
                <div className="flex justify-between text-[11px] text-white/40 font-mono">
                  <span>Deeper (-20Hz)</span>
                  <span className={localPitch === 0 ? 'text-[#FF79B0] font-bold' : ''}>Normal (0Hz)</span>
                  <span>Higher (+20Hz)</span>
                </div>
              </div>

              {/* Volume Slider Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/80">
                    {settings.volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#FF79B0]" />}
                    <span>TTS Output Volume</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#FF79B0] bg-[#FF79B0]/15 px-2.5 py-1 rounded-lg border border-[#FF79B0]/30">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.volume}
                  onChange={e => onSetVolume(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF79B0]"
                />
              </div>
            </div>
          )}

          {/* TAB: OFFLINE AUDIO (DOWNLOADS, IN-APP OFFLINE SYNC & MP3 EXPORT) */}
          {activeTab === 'offline' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Screen-Off & Voice Info Banner */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                      <Radio className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Screen-Off & Lock Screen Playback Enabled</h4>
                      <p className="text-[11px] text-white/50">Audio continues smoothly when your screen turns off or locks, with lock-screen scrubber controls.</p>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 text-[11px] font-mono text-white/90">
                    Voice: <strong className="text-[#FF79B0]">{settings.voice.replace('en-US-', '').replace('en-GB-', '').replace('Neural', '')}</strong>
                  </div>
                </div>
              </div>

              {/* DOWNLOAD NEW CHAPTERS SECTION */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DownloadCloud className="w-4 h-4 text-[#FF79B0]" />
                    <h3 className="font-bold text-sm text-white">Download Chapters</h3>
                  </div>
                  <span className="text-[11px] text-white/40">Synthesizes audio with your selected voice</span>
                </div>

                {/* Scope selector */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
                    Select Chapters To Download
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setDownloadScope('current')}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                        downloadScope === 'current'
                          ? 'bg-[#FF79B0]/20 border-[#FF79B0] text-[#FF79B0] shadow-sm'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Current (Ch. {currentChapterIndex + 1})
                    </button>

                    <button
                      type="button"
                      onClick={() => setDownloadScope('next5')}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                        downloadScope === 'next5'
                          ? 'bg-[#FF79B0]/20 border-[#FF79B0] text-[#FF79B0] shadow-sm'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Next 5 Chapters
                    </button>

                    <button
                      type="button"
                      onClick={() => setDownloadScope('next10')}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                        downloadScope === 'next10'
                          ? 'bg-[#FF79B0]/20 border-[#FF79B0] text-[#FF79B0] shadow-sm'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Next 10 Chapters
                    </button>

                    <button
                      type="button"
                      onClick={() => setDownloadScope('range')}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                        downloadScope === 'range'
                          ? 'bg-[#FF79B0]/20 border-[#FF79B0] text-[#FF79B0] shadow-sm'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>
                </div>

                {/* Custom Range Inputs */}
                {downloadScope === 'range' && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <span className="text-white/60 font-medium">Chapter range:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white/40">From Ch.</span>
                      <input
                        type="number"
                        min="1"
                        max={chapters.length || 1}
                        value={rangeStart}
                        onChange={e => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-[#FF79B0]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/40">To Ch.</span>
                      <input
                        type="number"
                        min={rangeStart}
                        max={chapters.length || 1}
                        value={rangeEnd}
                        onChange={e => setRangeEnd(Math.max(rangeStart, parseInt(e.target.value) || rangeStart))}
                        className="w-16 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-[#FF79B0]"
                      />
                    </div>
                    <span className="text-[11px] text-white/40 ml-auto">
                      Total: {Math.max(0, rangeEnd - rangeStart + 1)} chapters
                    </span>
                  </div>
                )}

                {/* Selected chapters summary */}
                {(() => {
                  let targets: typeof chapters = [];
                  if (downloadScope === 'current') {
                    const c = chapters[currentChapterIndex] || chapters[0];
                    if (c) targets = [c];
                  } else if (downloadScope === 'next5') {
                    targets = chapters.slice(currentChapterIndex, Math.min(chapters.length, currentChapterIndex + 5));
                  } else if (downloadScope === 'next10') {
                    targets = chapters.slice(currentChapterIndex, Math.min(chapters.length, currentChapterIndex + 10));
                  } else if (downloadScope === 'range') {
                    const s = Math.max(1, Math.min(rangeStart, chapters.length));
                    const e = Math.max(s, Math.min(rangeEnd, chapters.length));
                    targets = chapters.slice(s - 1, e);
                  }

                  const estSizeMB = (targets.length * 1.8).toFixed(1);

                  return (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between text-xs text-white/60">
                        <span>Ready to download: <strong className="text-white">{targets.length} chapter(s)</strong></span>
                        <span className="font-mono text-[11px] text-white/40">Est. size: ~{estSizeMB} MB</span>
                      </div>

                      {/* Download Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          disabled={downloadProgress.isDownloading || targets.length === 0}
                          onClick={async () => {
                            setOfflineActionMsg(null);
                            await downloadChapterRange(targets, {
                              voice: settings.voice,
                              pitch: `${settings.pitch >= 0 ? '+' : ''}${settings.pitch}Hz`,
                              exportMP3Directly: false
                            });
                            setOfflineActionMsg(`Downloaded ${targets.length} chapter(s) to in-app offline library!`);
                            setTimeout(() => setOfflineActionMsg(null), 4000);
                          }}
                          className="py-3 px-4 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                        >
                          <DownloadCloud className="w-4 h-4" />
                          <span>Download for Offline In-App Reading</span>
                        </button>

                        <button
                          type="button"
                          disabled={downloadProgress.isDownloading || targets.length === 0}
                          onClick={async () => {
                            setOfflineActionMsg(null);
                            await downloadChapterRange(targets, {
                              voice: settings.voice,
                              pitch: `${settings.pitch >= 0 ? '+' : ''}${settings.pitch}Hz`,
                              exportMP3Directly: true
                            });
                            setOfflineActionMsg(`Exported ${targets.length} MP3 audio file(s) to device!`);
                            setTimeout(() => setOfflineActionMsg(null), 4000);
                          }}
                          className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/15 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-[#FF79B0]" />
                          <span>Download MP3 File(s) to Device</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Live Download Progress Indicator */}
                {downloadProgress.isDownloading && (
                  <div className="p-4 rounded-xl bg-white/5 border border-[#FF79B0]/30 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#FF79B0] animate-ping" />
                        <span>Chapter {downloadProgress.currentChapterIndex} of {downloadProgress.totalChapters}</span>
                      </div>
                      <span className="font-mono text-[#FF79B0] font-bold">{downloadProgress.percent}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#FF79B0] to-purple-400 transition-all duration-300 rounded-full"
                        style={{ width: `${downloadProgress.percent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-white/50">
                      <span className="truncate pr-2">{downloadProgress.statusText}</span>
                      <button
                        type="button"
                        onClick={cancelDownload}
                        className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer underline flex-shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Status / Success Message */}
                {offlineActionMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{offlineActionMsg}</span>
                  </div>
                )}
              </div>

              {/* OFFLINE LIBRARY & STORAGE MANAGEMENT */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[#FF79B0]" />
                    <h3 className="font-bold text-sm text-white">Downloaded Audio Library</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">
                      Storage: <strong className="text-white font-mono">{storageUsage.totalMB} MB</strong> ({offlineChapters.length} saved)
                    </span>
                    {offlineChapters.length > 0 && !confirmClearOffline && (
                      <button
                        type="button"
                        onClick={() => setConfirmClearOffline(true)}
                        className="p-1 text-xs text-rose-400/80 hover:text-rose-400 hover:underline cursor-pointer ml-1"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                {/* Clear All Confirmation */}
                {confirmClearOffline && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs animate-in fade-in duration-150">
                    <span className="text-rose-300 font-semibold">Delete all {offlineChapters.length} offline audio chapters?</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await clearAllChapters();
                          setConfirmClearOffline(false);
                        }}
                        className="px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold cursor-pointer transition-all"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearOffline(false)}
                        className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white/80 rounded-lg cursor-pointer transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Chapters list or empty state */}
                {offlineChapters.length === 0 ? (
                  <div className="py-8 text-center text-white/40 space-y-2">
                    <DownloadCloud className="w-8 h-8 mx-auto opacity-30" />
                    <p className="text-xs">No offline audio chapters downloaded yet.</p>
                    <p className="text-[11px] text-white/30">Use the selector above to download chapters with text synchronization.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                    {offlineChapters.map((chap) => {
                      const chapMinutes = Math.round((chap.durationMs || 0) / 60000);
                      const sizeMB = ((chap.sizeBytes || 0) / (1024 * 1024)).toFixed(1);
                      const voiceLabel = (chap.voice || '').replace('en-US-', '').replace('en-GB-', '').replace('Neural', '');

                      return (
                        <div
                          key={chap.id}
                          className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-white truncate">
                              Chapter {chap.chapterNumber}: {chap.title}
                            </div>
                            <div className="text-[11px] text-white/40 flex items-center gap-2 mt-0.5">
                              <span>{chapMinutes > 0 ? `${chapMinutes} min` : '<1 min'}</span>
                              <span>·</span>
                              <span className="font-mono">{sizeMB} MB</span>
                              <span>·</span>
                              <span>Voice: {voiceLabel}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Play Offline Button */}
                            <button
                              type="button"
                              onClick={() => {
                                const chapIdx = chapters.findIndex(c => c.id === chap.id);
                                if (onPlayChapter && chapIdx !== -1) {
                                  onPlayChapter(chapIdx);
                                  onClose();
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                              title="Play offline in synced reader"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Play</span>
                            </button>

                            {/* Export MP3 Button */}
                            <button
                              type="button"
                              disabled={isExportingMP3Id === chap.id}
                              onClick={async () => {
                                setIsExportingMP3Id(chap.id);
                                try {
                                  await exportChapterMP3(chap);
                                } finally {
                                  setIsExportingMP3Id(null);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all cursor-pointer"
                              title="Export MP3 file directly to device"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => deleteChapter(chap.id)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 transition-all cursor-pointer"
                              title="Delete from offline storage"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HIGHLIGHT & SCROLL */}
          {activeTab === 'display' && (
            <div className="space-y-6">
              {/* Highlight Mode */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2.5">
                  Visual Highlighting Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'both', label: 'Line & Word', desc: 'Edge sky blue highlight on active line + Yellow spoken word' },
                    { id: 'sentence', label: 'Active Line Only', desc: 'Sky blue highlight on the line being read' },
                    { id: 'word', label: 'Word Only', desc: 'Yellow highlight tracks individual spoken words' },
                    { id: 'none', label: 'Audio Only', desc: 'Pure novel text without visual highlights' }
                  ].map(mode => {
                    const isSelected = settings.highlightMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => onSetHighlightMode(mode.id as any)}
                        className={`p-3.5 text-left rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF79B0]/15 border-[#FF79B0] shadow-lg ring-1 ring-[#FF79B0]/50'
                            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]'
                        }`}
                      >
                        <div className="font-bold text-white text-sm flex items-center justify-between">
                          <span>{mode.label}</span>
                          {isSelected && <Check className="w-4 h-4 text-[#FF79B0]" />}
                        </div>
                        <p className="text-xs text-white/50 mt-1">{mode.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto-Scroll Behavior */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2.5">
                  Auto-Scroll Behavior
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'center', label: 'Center View', desc: 'Keeps spoken sentence centered on screen' },
                    { id: 'edge', label: 'Edge Only', desc: 'Scrolls when reaching screen borders' },
                    { id: 'off', label: 'Disabled', desc: 'Scroll manually without auto-snapping' }
                  ].map(opt => {
                    const isSelected = settings.autoScrollMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetAutoScrollMode(opt.id as any)}
                        className={`p-3.5 text-left rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF79B0]/15 border-[#FF79B0] shadow-lg ring-1 ring-[#FF79B0]/50'
                            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]'
                        }`}
                      >
                        <div className="font-bold text-white text-sm flex items-center justify-between">
                          <span>{opt.label}</span>
                          {isSelected && <Check className="w-4 h-4 text-[#FF79B0]" />}
                        </div>
                        <p className="text-xs text-white/50 mt-1">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Audio-Visual Sync Calibration */}
              {onSetSyncOffset && (
                <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-white/80">
                        Audio Sync Calibration
                      </label>
                      <p className="text-xs text-white/50 mt-0.5">
                        Compensates Bluetooth headset latency for exact word synchronization
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#FF79B0] bg-[#FF79B0]/15 px-2.5 py-1 rounded-lg border border-[#FF79B0]/30">
                      {settings.syncOffsetMs ?? -120} ms
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-white/40 font-mono">-300ms</span>
                    <input
                      type="range"
                      min="-300"
                      max="200"
                      step="10"
                      value={settings.syncOffsetMs ?? -120}
                      onChange={e => onSetSyncOffset(parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF79B0]"
                    />
                    <span className="text-[11px] text-white/40 font-mono">+200ms</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/40">Earlier Highlight</span>
                    <button
                      type="button"
                      onClick={() => onSetSyncOffset(-120)}
                      className="text-[#FF79B0] hover:underline font-bold cursor-pointer"
                    >
                      Reset to -120ms (Optimal)
                    </button>
                    <span className="text-white/40">Later Highlight</span>
                  </div>
                </div>
              )}

              {/* Floating Header Clock Option */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-[#FF79B0]/20 text-[#FF79B0] border border-[#FF79B0]/30 flex-shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Player Header Clock Option</h4>
                    <p className="text-xs text-white/50 mt-0.5">
                      Show or hide the timeline scrubber clock button in the floating player header
                    </p>
                  </div>
                </div>
                <button
                  id="toggle-show-clock-in-bar-btn"
                  type="button"
                  onClick={() => {
                    const next = !(settings.showClockInBar ?? true);
                    if (onSetShowClockInBar) onSetShowClockInBar(next);
                  }}
                  className={`w-11 h-6 rounded-full transition-all duration-200 relative flex items-center p-0.5 cursor-pointer flex-shrink-0 ${
                    (settings.showClockInBar ?? true) ? 'bg-[#FF79B0]' : 'bg-white/20'
                  }`}
                  role="switch"
                  aria-checked={settings.showClockInBar ?? true}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-slate-900 shadow-md transition-transform duration-200 ${
                      (settings.showClockInBar ?? true) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Preview Box */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Visual Highlight Preview (Edge Read Aloud Style)
                </span>
                <p className="text-sm leading-relaxed text-white/80">
                  Previous text in the paragraph.{' '}
                  {settings.highlightMode === 'both' && (
                    <span 
                      className="rounded-[3px] px-1 py-[2px] mx-0.5 inline box-decoration-clone"
                      style={{ backgroundColor: '#B2D6F3', color: '#000000' }}
                    >
                      The active sentence is highlighted, and the{' '}
                      <span 
                        className="font-normal px-[3px] py-0 rounded-[2px] inline"
                        style={{ backgroundColor: '#FFFF00', color: '#000000' }}
                      >
                        spoken
                      </span>{' '}
                      word tracks in vibrant yellow.
                    </span>
                  )}
                  {settings.highlightMode === 'sentence' && (
                    <span 
                      className="rounded-[3px] px-1 py-[2px] mx-0.5 inline box-decoration-clone"
                      style={{ backgroundColor: '#B2D6F3', color: '#000000' }}
                    >
                      The active sentence has an Edge light sky blue highlight with crisp black text.
                    </span>
                  )}
                  {settings.highlightMode === 'word' && (
                    <span>
                      Only the active{' '}
                      <span 
                        className="font-normal px-[3px] py-0 rounded-[2px] inline"
                        style={{ backgroundColor: '#FFFF00', color: '#000000' }}
                      >
                        spoken
                      </span>{' '}
                      word is emphasized.
                    </span>
                  )}
                  {settings.highlightMode === 'none' && (
                    <span>Clean reading text without visual highlights.</span>
                  )}
                  {' '}Remaining text continues.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: SLEEP TIMER */}
          {activeTab === 'timer' && (
            <div className="space-y-6">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#FF79B0]/10 border border-[#FF79B0]/25 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-[#FF79B0]/20 text-[#FF79B0] border border-[#FF79B0]/30 flex-shrink-0">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Gentle Bedtime Sleep Timer</h4>
                    <p className="text-xs text-white/60 mt-0.5">
                      Smoothly fades out audio in the final 15 seconds so you are not startled awake.
                    </p>
                  </div>
                </div>
                {sleepTimerRemainingSec !== null && (
                  <div className="text-right">
                    <div className="text-xl font-mono font-extrabold text-[#FF79B0]">
                      {formatTimer(sleepTimerRemainingSec)}
                    </div>
                    <span className="text-[10px] text-white/50">remaining</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2.5">
                  Select Timer Duration
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { val: null, label: 'Off' },
                    { val: 15, label: '15 Minutes' },
                    { val: 30, label: '30 Minutes' },
                    { val: 45, label: '45 Minutes' },
                    { val: 60, label: '60 Minutes' },
                    { val: -1, label: 'End of Chapter' }
                  ].map(opt => {
                    const isSelected = sleepTimerMinutes === opt.val;
                    return (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => onSetSleepTimer(opt.val)}
                        className={`py-3 px-4 rounded-2xl border font-bold text-xs transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-md font-extrabold'
                            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10 text-white/80'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CACHE & PRELOAD */}
          {activeTab === 'cache' && (
            <div className="space-y-6">
              {/* Cache Statistics Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Server Audio Storage</h4>
                    <p className="text-xs text-white/50 mt-0.5">
                      High-fidelity 24kHz MP3 audio and sentence timing metadata saved locally
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-white font-mono">
                    {formatBytes(cacheStats.totalSizeBytes)}
                  </div>
                  <span className="text-xs text-white/50">
                    {cacheStats.audioFiles} files cached
                  </span>
                </div>
              </div>

              {/* Status Message */}
              {preloadStatus && (
                <div className="p-3.5 rounded-2xl bg-[#FF79B0]/15 border border-[#FF79B0]/30 text-[#FF79B0] text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{preloadStatus}</span>
                </div>
              )}

              {/* Preloader Actions */}
              <div className="space-y-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Pre-Cache Chapter Audio
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isPreloading}
                    onClick={handlePreloadCurrent}
                    className="p-3.5 rounded-2xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all text-left flex items-start gap-3 disabled:opacity-40 cursor-pointer"
                  >
                    <DownloadCloud className="w-4 h-4 text-[#FF79B0] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-xs text-white">
                        Preload Current Chapter
                      </div>
                      <p className="text-[11px] text-white/50 mt-0.5">
                        Synthesizes all remaining chunks in chapter {currentChapterIndex + 1}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isPreloading}
                    onClick={handlePreloadNext}
                    className="p-3.5 rounded-2xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all text-left flex items-start gap-3 disabled:opacity-40 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-xs text-white">
                        Preload Next 3 Chapters
                      </div>
                      <p className="text-[11px] text-white/50 mt-0.5">
                        Guarantees instantaneous offline or low-connectivity transitions
                      </p>
                    </div>
                  </button>
                </div>

                <div className="pt-2">
                  {!confirmClearPrompt ? (
                    <button
                      type="button"
                      disabled={isClearingCache || cacheStats.audioFiles === 0}
                      onClick={() => setConfirmClearPrompt(true)}
                      className="w-full p-3 rounded-2xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 text-xs font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear TTS Audio Cache ({cacheStats.audioFiles} files)</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 animate-in fade-in duration-150">
                      <button
                        type="button"
                        disabled={isClearingCache}
                        onClick={handleClear}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Confirm: Delete {cacheStats.audioFiles} Files</span>
                      </button>
                      <button
                        type="button"
                        disabled={isClearingCache}
                        onClick={() => setConfirmClearPrompt(false)}
                        className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-white/50">
            Selected: <strong className="text-white/80">{settings.voice}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
