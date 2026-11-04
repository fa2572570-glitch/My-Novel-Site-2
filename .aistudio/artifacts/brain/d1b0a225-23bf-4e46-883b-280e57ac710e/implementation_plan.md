# Offline Audio Chapter Downloads & Screen-Off Background Player

Add an offline audio chapter system integrated directly into a new **"Offline Audio"** space inside the **Voice Options Modal** (`EdgeVoiceOptionsModal`). Readers can download single chapters or custom chapter ranges with their chosen Edge voice and speed, enjoy seamless screen-off background playback when device screens are locked, listen offline with synchronized sentence/word highlighting, manage offline storage, and export MP3 files directly to device storage.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following revisions have been incorporated per your request:
> - **Unified in Voice Options Modal**: All offline features (single chapter download, range selector, offline library manager, and MP3 exporter) will be housed in a new dedicated **"Offline Audio" tab** within the existing Voice Options modal (`EdgeVoiceOptionsModal`), keeping voice selection, playback speed, and offline controls consolidated in one clean hub.
> - **Screen-Off / Background Playback**: The audio player will support continuous playback when the phone or device screen is locked or turned off. This is achieved via comprehensive `navigator.mediaSession` integration, background audio keepalive, gapless chunk/chapter pre-buffering, and lock-screen media controls.
> - **Full Text Highlighting Synchronization**: When playing downloaded offline chapters in-app, 60fps word-by-word and sentence-by-sentence text tracking and tap-to-seek remain active with zero network requests.
> - **Flexible Chapter Selection**: Supports downloading the current chapter, custom chapter ranges (e.g., Chapters 1 to 20), or quick presets ("Next 5 chapters", "Next 10 chapters").
> - **Device MP3 Export**: Users can export single consolidated `.mp3` files per chapter directly to device storage.

---

## 1. Overview & Core Concept

### What It Delivers
1. **Dedicated "Offline Audio" Space in Voice Options**:
   - In `EdgeVoiceOptionsModal`, a new tab labeled **"Offline Audio"** (with `<DownloadCloud>` icon) sits alongside Voice, Display, and Timer.
   - Contains two organized sections:
     - **Download New Chapters**: Scope selector (Current chapter, Custom range, Next 5/10), chosen voice indicator, file size estimate, and real-time progress bar.
     - **Offline Audio Library**: List of downloaded chapters, duration, size, instant Play button, direct "Export MP3" button, and storage cleaner.
2. **Screen-Off Background Playback**:
   - When the user turns off or locks their phone screen, playback continues uninterrupted across chunks and chapter boundaries.
   - Lock screen displays chapter title, novel name, chosen voice narrator, progress scrubber, and media controls (Play/Pause, Next Chapter, Previous Chapter, Seek 15s).
3. **In-App Offline Synchronization**:
   - Downloaded chapters store both audio blobs and sentence/word timing metadata in browser IndexedDB.
   - Reading along offline provides the exact same rich experience: karaoke sentence highlighting, word tracking, and smooth autoscroll.
4. **Direct MP3 File Download**:
   - 1-click download saves a standard playable `.mp3` file directly to the device for use in external media apps, car audio, or smart watches.

---

## 2. User Experience & Visual Design

### Location & Layout in Voice Options Modal

Inside `EdgeVoiceOptionsModal.tsx`, the tab navigation expands to include:
- `Voice` (Narrator selection & pitch)
- `Offline Audio` (✨ **New Dedicated Space**: Download range, Offline Library, MP3 export)
- `Display` (Sentence/word highlighting styles, autoscroll)
- `Timer` (Sleep timer presets)
- `Cache` (Server disk cache stats)

#### Inside the "Offline Audio" Tab:
1. **Download New Audio Section**:
   - **Voice Indicator**: Shows the active voice (`en-US-SteffanNeural`) with a note: *"Audio will be synthesized with your selected voice"*.
   - **Scope Selector Segmented Buttons**:
     - `Current Chapter (Ch. X)`
     - `Next 5 Chapters`
     - `Next 10 Chapters`
     - `Custom Range` (Number inputs: `From Chapter [X]` to `To Chapter [Y]`)
   - **Download Estimation**: Estimated storage (e.g. `~1.8 MB per chapter`) and total chapters count.
   - **Action Buttons**:
     - `Download to In-App Library` (for offline synced reading)
     - `Export MP3 to Device` (direct file download)
   - **Live Progress Card**: Displays during download with progress percentage, active chapter name, chunk status, and a `Cancel` button.

2. **Downloaded Library Section**:
   - **Storage Meter**: Shows disk footprint (e.g., `42.5 MB stored · 8 chapters`) with a `Clear All` button.
   - **Chapter Cards List**:
     - Chapter number and title.
     - Metadata line: `12 min · 2.1 MB · Steffan · Downloaded 2h ago`.
     - Actions: `▶ Play Now`, `⬇ MP3`, and `🗑 Delete`.

### Screen-Off Lock Screen Player UX
- Lock screen displays rich media metadata:
  - **Title**: `Chapter 14: The Hidden Chamber`
  - **Artist / Narrator**: `Steffan (Natural) · Edge Read Aloud`
  - **Album**: Novel Book Title
  - **Artwork**: Stylized book cover artwork
- Controls:
  - Play / Pause toggle
  - Skip Forward 15s / Skip Backward 15s
  - Next Chapter / Previous Chapter
  - Interactive lock-screen timeline scrubber

---

## 3. Screen-Off Playback Architecture & Technical Safeguards

Mobile operating systems (iOS WebKit and Android Chrome) aggressively freeze JavaScript execution within 5–15 seconds of the screen locking unless media playback is continuously active.

### Safeguards Implemented for Screen-Off Continuity:
1. **Continuous Audio Pipeline (Zero-Gap Handoff)**:
   - When Chunk A is nearing completion, Chunk B is pre-buffered on the standby `<audio>` element.
   - The audio transition executes without pausing: the active player transitions instantly, preventing the browser from interpreting a momentary silence as an idle session.
2. **Audio Element Optimization**:
   - HTML5 `<audio>` tags are configured with `playsInline={true}`, `preload="auto"`, and persistent DOM mounting.
3. **Full `navigator.mediaSession` Implementation**:
   - Action handlers registered for:
     - `play`, `pause`
     - `previoustrack`, `nexttrack` (triggers chapter jump)
     - `seekbackward`, `seekforward` (jumps 10–15 seconds)
     - `seekto` (jumps to exact position on lock-screen scrubber)
     - `stop`
   - Explicitly update `navigator.mediaSession.playbackState = 'playing'` or `'paused'`.
   - Update `setPositionState({ duration, playbackRate, position })` at regular intervals to keep the lock screen progress bar synced.

---

## 4. Technical Architecture & Data Strategy

### System Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Voice Options Modal                             │
│                     (EdgeVoiceOptionsModal.tsx)                        │
│                                                                        │
│  ┌───────────┐  ┌────────────────────────────────────┐  ┌───────────┐  │
│  │ Voice Tab │  │  ★ Offline Audio Tab (New Space)   │  │ Timer Tab │  │
│  └───────────┘  └─────────────────┬──────────────────┘  └───────────┘  │
│                                   │                                    │
│           ┌───────────────────────┴───────────────────────┐             │
│           ▼                                               ▼             │
│  ┌──────────────────────────────┐        ┌───────────────────────────┐ │
│  │   Chapter Downloader Card    │        │  Downloaded Audio Library │ │
│  │ (Current / Range / Presets)  │        │ (Play / Export MP3 / Del) │ │
│  └──────────────┬───────────────┘        └─────────────┬─────────────┘ │
└─────────────────┼──────────────────────────────────────┼───────────────┘
                  │                                      │
                  ▼                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Client-Side Storage (IndexedDB Engine)                 │
│                      (src/utils/offlineAudioStorage.ts)                │
│                                                                        │
│   DB: 'novel_audio_offline_db'  |  Store: 'chapters'                   │
│   Record: {                                                            │
│     id: chapterId, chapterNumber, title, voice, pitch,                 │
│     audioBlob: Blob, durationMs, sizeBytes, downloadedAt,              │
│     sentences: TTSSentenceTiming[], words: TTSWordTiming[]             │
│   }                                                                    │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Edge Read Aloud Engine & Screen-Off                    │
│                     (src/hooks/useEdgeReadAloud.ts)                    │
│                                                                        │
│   • Offline Detection: Checks IndexedDB before network fetch           │
│   • Plays Blob URL via URL.createObjectURL(record.audioBlob)          │
│   • Dual-Player Gapless Audio Buffer (No session release)             │
│   • navigator.mediaSession continuous lock-screen state & actions      │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Server Endpoint Additions                         │
│                           (server.ts)                                  │
│                                                                        │
│   • POST /api/tts/export-mp3  (Stitches chunk audio into single MP3)   │
└────────────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities:

1. **`src/utils/offlineAudioStorage.ts`**:
   - Zero-dependency browser IndexedDB database manager.
   - Operations: `saveOfflineChapter`, `getOfflineChapter`, `getAllOfflineChapters`, `deleteOfflineChapter`, `getStorageUsage`.

2. **`src/hooks/useOfflineAudio.ts`**:
   - Manages download queue, chunk synthesis, progress percent calculation, and direct MP3 file trigger.
   - Exposes `downloadChapter(chapter, voice)`, `downloadRange(startIndex, endIndex, voice)`, `exportMP3(chapterId)`.

3. **`src/components/EdgeVoiceOptionsModal.tsx`**:
   - Integrates the new **"Offline Audio"** tab.
   - Renders download controls, range inputs, active download progress bar, and local offline audio library with MP3 export buttons.

4. **`src/hooks/useEdgeReadAloud.ts`**:
   - Offline playback interceptor: if a chapter is downloaded, plays instantly from IndexedDB Blob without network.
   - Full MediaSession action registration and lock-screen synchronization for screen-off playback.
   - Gapless standby player pre-buffering to keep the background audio thread alive when the phone is locked.

5. **`server.ts` & `server/ttsService.ts`**:
   - Single-chapter consolidated MP3 streaming route `/api/tts/export-mp3` for instant direct download to device storage.

---

## Verification Plan

### Automated & Build Verification
1. **Compilation Check**: Run `compile_applet` to ensure full TypeScript typing and build pass.
2. **Lint Validation**: Run `lint_applet` to verify zero errors or broken imports.

### Manual & Feature Verification
1. **Voice Options Modal Navigation**:
   - Open Voice Options modal and click the new **"Offline Audio"** tab.
   - Verify layout is clean, legible, and adheres to dark theme styling.
2. **Current Chapter & Range Download**:
   - Download the current chapter with active voice; verify real-time progress bar.
   - Test custom range (e.g., Chapters 1 to 3) and verify all chapters download and appear in the offline list.
3. **In-App Offline Playback & Sync**:
   - Simulate offline mode / disable network.
   - Click "Play" on a downloaded chapter from the Voice Options modal or reader bar.
   - Confirm audio plays immediately and sentence/word highlighting moves in lockstep.
   - Change speed (1.25x, 1.5x) and verify speed changes smoothly without pitch distortion.
4. **Screen-Off Background Playback**:
   - Start playback, lock device screen (or minimize browser tab).
   - Verify audio continues playing across sentences and auto-advances to the next chapter.
   - Verify lock screen shows chapter title, novel name, voice name, and playable scrubber controls.
5. **Direct MP3 Export**:
   - Click "Export MP3" for a chapter.
   - Verify browser triggers download of a single `.mp3` file that plays in native audio apps.
6. **Storage Cleanup**:
   - Delete an individual chapter and test "Clear All Offline Audio" to verify storage counter updates to 0 bytes.
