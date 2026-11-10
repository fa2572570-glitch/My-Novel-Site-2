import React, { useState } from 'react';
import {
  DownloadCloud,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Trash2,
  Play,
  Download,
  Check,
  Radio,
  FileAudio,
  BookOpen
} from 'lucide-react';
import { useOfflineAudio } from '../hooks/useOfflineAudio';

interface OfflineAudioAccordionProps {
  chapters: Array<{
    id: string;
    number: number;
    title: string;
    content: string[];
  }>;
  novelId?: string;
  novelTitle?: string;
  voice?: string;
  pitch?: string;
  onOpenDownloadModal: () => void;
  onPlayChapter?: (chapterIndex: number) => void;
  onCloseSettings?: () => void;
}

export function OfflineAudioAccordion({
  chapters = [],
  novelId = 'novel',
  novelTitle = 'Web Novel',
  voice = 'en-US-SteffanNeural',
  pitch = '+0Hz',
  onOpenDownloadModal,
  onPlayChapter,
  onCloseSettings
}: OfflineAudioAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const {
    offlineChapters,
    storageUsage,
    deleteChapter,
    clearAllChapters,
    exportChapterMP4
  } = useOfflineAudio(novelId);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden transition-all duration-200">
      {/* COLLAPSIBLE ACCORDION HEADER */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-3 min-w-0 pr-2">
          <div className="p-2.5 rounded-xl bg-[#FF79B0]/15 text-[#FF79B0] border border-[#FF79B0]/25 group-hover:scale-105 transition-transform shrink-0">
            <DownloadCloud className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <h4 className="text-sm font-bold text-white tracking-tight">Audio Download</h4>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#FF79B0]/15 text-[#FF79B0] border border-[#FF79B0]/25 font-mono text-[10px] font-bold tracking-tight">
              {storageUsage.totalMB} MB · {offlineChapters.length} saved
            </span>
          </div>
        </div>

        <div className="flex items-center shrink-0">
          <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center text-white/70 transition-all">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* EXPANDED ACCORDION CONTENT */}
      {isExpanded && (
        <div className="p-4 sm:p-5 pt-0 border-t border-white/10 space-y-4 animate-in fade-in duration-200 text-xs">
          {/* Primary Action Button to Open Chapter Download Modal */}
          <button
            type="button"
            onClick={onOpenDownloadModal}
            className="w-full py-2.5 px-4 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>Download Chapters (MP4)</span>
          </button>

          {/* OFFLINE LIBRARY SECTION */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#FF79B0]" />
                <span>Downloaded Offline Chapters ({offlineChapters.length})</span>
              </span>

              {offlineChapters.length > 0 && !confirmClear && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="text-rose-400 hover:text-rose-300 text-[11px] hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Clear All Confirmation */}
            {confirmClear && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-2 animate-in fade-in duration-150">
                <span className="text-rose-300 text-[11px] font-medium">
                  Delete all {offlineChapters.length} offline audio files?
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await clearAllChapters();
                      setConfirmClear(false);
                    }}
                    className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/15 text-white/70 rounded-lg text-[11px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Chapter list */}
            {offlineChapters.length === 0 ? (
              <div className="py-6 text-center text-white/40 space-y-1 bg-white/[0.02] rounded-xl border border-white/5">
                <FileAudio className="w-6 h-6 mx-auto opacity-30" />
                <p className="text-xs">No offline chapters downloaded yet.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                {offlineChapters.map(chap => {
                  const chapMinutes = Math.round((chap.durationMs || 0) / 60000);
                  const sizeMB = ((chap.sizeBytes || 0) / (1024 * 1024)).toFixed(1);
                  const cleanTitle = chap.title?.replace(/^Chapter\s+\d+[:\s-]*/i, '').trim();
                  const displayTitle = cleanTitle ? `Ch. ${chap.chapterNumber}: ${cleanTitle}` : (chap.title || `Chapter ${chap.chapterNumber}`);

                  return (
                    <div
                      key={chap.id}
                      className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-white truncate text-xs">
                          {displayTitle}
                        </div>
                        <div className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5 font-mono">
                          <span>{chapMinutes > 0 ? `${chapMinutes} min` : '<1 min'}</span>
                          <span>·</span>
                          <span>{sizeMB} MB</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Play Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const idx = chapters.findIndex(c => c.id === chap.id);
                            if (onPlayChapter && idx !== -1) {
                              onPlayChapter(idx);
                              if (onCloseSettings) onCloseSettings();
                            }
                          }}
                          className="p-1.5 rounded-lg bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-bold flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                          title="Play offline in synced reader"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>

                        {/* Export MP4 Button */}
                        <button
                          type="button"
                          disabled={exportingId === chap.id}
                          onClick={async () => {
                            setExportingId(chap.id);
                            try {
                              await exportChapterMP4(chap, { bundleTitle: novelTitle });
                            } finally {
                              setExportingId(null);
                            }
                          }}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all cursor-pointer"
                          title="Export .mp4 file to device"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => deleteChapter(chap.id)}
                          className="p-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 transition-all cursor-pointer"
                          title="Delete from offline storage"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
    </div>
  );
}
