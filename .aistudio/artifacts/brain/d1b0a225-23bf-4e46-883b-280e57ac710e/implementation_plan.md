# Offline Audio Chapter Downloads & Continuous MP4 Batch Bundler

Revise the offline audio downloader to replace abstract number inputs with an interactive **Chapter Selection List** (modeled directly on the *Quick Chapter Navigator* layout from the user screenshot), add **Continuous Multi-Chapter Batch Merging** (e.g. selecting 50 chapters with a 10-chapter continuous option to download 5 continuous files instead of 50 individual files), output files in **MP4 format instead of MP3**, and locate the feature in **Reading Settings** in a clean, discoverable accordion ("hidden but not too much hidden").

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following revisions have been incorporated from your latest request and screenshot:
> - **Interactive Chapter Selection List (Quick Chapter Navigator Reference)**:
>   - Replaces abstract range numbers (1 to 10) with an interactive chapter picker matching the styling and layout of the attached *Quick Chapter Navigator* screenshot.
>   - Displays all chapters available in the novel with filter search (`Filter chapters...`), individual checkboxes, and quick bulk toggles (*Select All*, *Select Next 10*, *Select Next 50*, *Deselect*).
> - **Continuous Multi-Chapter Batch Downloads (e.g. 50 chapters $\rightarrow$ 5 files)**:
>   - Adds a **"Continuous Download / Merge into Bundles"** toggle.
>   - When enabled, allows setting the batch size (default: **10 chapters per file**, with options for 5, 10, 20, or custom).
>   - **Automatic Batch Grouping**: Selecting 50 chapters with batch size 10 generates exactly **5 continuous downloaded files** instead of 50 individual files.
> - **MP4 Format Instead of MP3**:
>   - Downloads are exported as MPEG-4 (`.mp4`) audio files encoded with AAC and `+faststart` metadata using server-side FFmpeg.
>   - Universal playback compatibility across smartphones, car audio systems (CarPlay / Android Auto), and standalone media players.
> - **Location in Reading Settings ("Hidden but not too much hidden")**:
>   - Positioned inside the main **Reading Settings** modal as an expandable card titled **"Offline Audio & Chapter Downloads"**.
>   - Completely removed from the Voice Options modal to keep voice settings lightweight and focused.
> - **Screen-Off Background Playback**:
>   - Retains continuous background playback when the device screen is locked or turned off, with full lock-screen media session controls (`navigator.mediaSession`).

---

## 1. Overview & Core Concept

### What It Delivers
1. **Visual Chapter Picker (Modeled on Quick Chapter Navigator)**:
   - When the user taps **"Download Chapters"** inside Settings, a selection interface opens matching the layout of the user's screenshot:
     - Header: Chapter count summary (e.g. `14 selected of 50`).
     - Search bar: `Filter chapters...` with instant keyword filtering.
     - Chapter rows: `📖 Chapter X: Title` + paragraph counts (`78 paras`) with custom selection checkboxes.
2. **Continuous Multi-Chapter Bundling**:
   - Rather than flooding the device downloads folder with 50 small files, the user enables **Continuous Download** and sets a bundle threshold (e.g. 10 chapters).
   - The engine automatically chunks and merges consecutive chapters:
     - `Bundle 1`: Chapters 1 to 10 $\rightarrow$ `Novel_Title_Ch001-010.mp4`
     - `Bundle 2`: Chapters 11 to 20 $\rightarrow$ `Novel_Title_Ch011-020.mp4`
     - `Bundle 3`: Chapters 21 to 30 $\rightarrow$ `Novel_Title_Ch021-030.mp4`
     - `Bundle 4`: Chapters 31 to 40 $\rightarrow$ `Novel_Title_Ch031-040.mp4`
     - `Bundle 5`: Chapters 41 to 50 $\rightarrow$ `Novel_Title_Ch041-050.mp4`
3. **MPEG-4 (.mp4) Audio Encoding**:
   - Synthesized Edge TTS audio is stitched and encoded into `.mp4` containers via FFmpeg with standard AAC audio and fast-start headers for instant mobile seeking.
4. **In-App Offline Synchronization**:
   - Downloaded chapters are also indexed into browser IndexedDB storage so readers can listen offline inside the app with synchronized sentence and word highlighting.

---

## 2. User Experience & Visual Design

### 1. The Settings Accordion Card (Reading Settings Dialog)
- Located in Section 6/7 of Reading Settings.
- **Collapsed**:
  - Icon: `<DownloadCloud className="w-5 h-5 text-[#FF79B0]" />`
  - Title: **"Offline Audio & Downloads"**
  - Subtitle: *"Download continuous chapter MP4s for offline & screen-off listening"*
  - Badge: `Storage: 24.5 MB · 12 chapters cached`
  - Chevron: `<ChevronDown />`
- **Expanded**:
  - Quick action buttons: **"Select & Download Chapters"** (opens chapter selector), and **"Manage Stored Audio"** (opens offline library).

### 2. Chapter Selector Dialog (Screenshot Reference Design)
Matching the dark aesthetic (`#16181D` surface, `#FF79B0` accent, `border-white/15`):
- **Header**:
  - Title: `Download Audio Chapters`
  - Counter badge: `${selectedIds.length} of ${chapters.length} Selected`
  - Close button `(X)`
- **Search & Quick Toggles**:
  - Search input: `<Search />` with placeholder `Filter chapters...`
  - Quick pill buttons:
    - `Select All`
    - `Next 10`
    - `Next 50`
    - `Deselect All`
- **Continuous Download Configuration Card**:
  - Toggle: **"Continuous Multi-Chapter Download"** (Enabled by default).
  - Continuous Batch Size selector:
    - Preset buttons: `[ 5 Ch / File ]` `[ 10 Ch / File ]` `[ 20 Ch / File ]` `[ 25 Ch / File ]`
    - Custom number input: `Chapters per MP4 file: [ 10 ]`
  - **Dynamic Output Summary**:
    - Clearly shows calculated file count:
      - *"50 chapters selected $\rightarrow$ **5 MP4 files** (10 chapters per file), ~90 MB total"*
      - *"Format: MPEG-4 Audio (.mp4) · Narrator: Steffan (Natural)"*
- **Scrollable Chapter Items List** (from screenshot):
  - Each item:
    - Checkbox with pink checkmark on active state.
    - Chapter label: `📖 Chapter 177: Auction [6]`
    - Paragraph badge: `78 paras`
    - Currently reading indicator if applicable.
- **Sticky Bottom Action Bar**:
  - Summary: `${selectedIds.length} Chapters selected (${totalFiles} MP4 file${totalFiles > 1 ? 's' : ''})`
  - Download Button: `<Download className="w-4 h-4" /> Download ${totalFiles} Continuous MP4 File${totalFiles > 1 ? 's' : ''}`

### 3. Active Download & Synthesis Progress Modal
- Live chapter and batch progress:
  - Overall progress bar: `File 2 of 5: Chapters 11–20 (45%)`
  - Real-time synthesis status: `Synthesizing Chapter 14: The Hidden Chamber (chunk 3 of 6)...`
  - Cancel button to abort gracefully.

---

## 3. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                            │
│                                                                        │
│  ┌──────────────────────────────────┐  ┌────────────────────────────┐  │
│  │ ReadingSettings (Accordion Card) │  │  VoiceOptionsModal         │  │
│  │   "Offline Audio & Downloads"    │  │  (Offline tab removed)     │  │
│  └──────────────────┬───────────────┘  └────────────────────────────┘  │
│                     │                                                  │
│                     ▼ Taps "Download Chapters"                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │          ChapterDownloadModal (Screenshot Reference UI)          │  │
│  │  • Search filter & quick selectors (All, Next 10, Next 50)       │  │
│  │  • Multi-select checkboxes matching Quick Chapter Navigator      │  │
│  │  • Continuous Download Toggle & Batch Size (e.g. 10 Ch / File)   │  │
│  │  • Output Preview: "50 chapters selected -> 5 MP4 files"         │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Client Controller (useOfflineAudio Hook)              │
│                                                                        │
│   • Groups selected chapters into batches of N (e.g. [1..10], [11..20])│
│   • Calls /api/tts/export-bundle-mp4 for each continuous batch         │
│   • Stores chapters and timing metadata in IndexedDB for offline sync │
│   • Triggers automatic browser file download for each .mp4 file        │
└─────────────────────┬──────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Server / Express Route & FFmpeg Engine                │
│                                                                        │
│   • POST /api/tts/export-bundle-mp4                                    │
│       1. Synthesizes/retrieves audio chunks for all chapters in batch  │
│       2. Uses /usr/bin/ffmpeg to concatenate audio streams             │
│       3. Encodes to MP4 container (AAC codec, -movflags +faststart)   │
│       4. Streams response as 'video/mp4' / 'audio/mp4' attachment      │
│          Filename: "NovelTitle_Chapters_001-010.mp4"                   │
└────────────────────────────────────────────────────────────────────────┘
```

### FFmpeg Continuous MP4 Concatenation Pipeline
For a batch of chapters (e.g., Chapters 1 to 10):
1. The server ensures all chunk audio files are synthesized and cached on disk.
2. Generates an FFmpeg concat manifest file listing all chapter chunk files in order:
   ```text
   file '/cache/tts/audio/chunk_1.mp3'
   file '/cache/tts/audio/chunk_2.mp3'
   ...
   ```
3. Executes FFmpeg command:
   ```bash
   ffmpeg -f concat -safe 0 -i concat_list.txt -c:a aac -b:a 128k -movflags +faststart output.mp4
   ```
4. Streams `output.mp4` directly to client with `Content-Type: video/mp4` and `Content-Disposition: attachment; filename="Novel_Chapters_001-010.mp4"`.
5. Cleans up temporary manifest and temporary MP4 file.

---

## 4. Implementation Steps

1. **Remove Offline Tab from `EdgeVoiceOptionsModal.tsx`**:
   - Revert tab set to `'voice' | 'display' | 'timer' | 'cache'`.
   - Remove unused offline UI code from the voice options modal.
2. **Server-side Continuous MP4 Bundler (`server.ts` & `server/ttsService.ts`)**:
   - Implement `exportChapterBundleMP4(chapters, novelId, voice, pitch)`:
     - Pre-synthesizes all chunks for the chapters.
     - Uses `ffmpeg` to concatenate and encode into a single `.mp4` file.
   - Register route `POST /api/tts/export-bundle-mp4`.
3. **Build `ChapterDownloadModal.tsx` (Component based on Screenshot UI)**:
   - Full chapter picker with search filter, individual checkboxes, Select All, and Next 10/50 pills.
   - Continuous download toggle with batch size input (default: 10 chapters per file).
   - Dynamic calculation and display of output files (e.g. 50 chapters $\rightarrow$ 5 MP4 files).
4. **Build `OfflineAudioAccordion.tsx` (Inside Reading Settings)**:
   - Collapsible card placed in Reading Settings Section 6/7.
   - Shows storage usage and a trigger button to open the `ChapterDownloadModal` and manage saved audio.
5. **Update `useOfflineAudio.ts`**:
   - Add `downloadContinuousMP4Batches(selectedChapters, batchSize, options)`:
     - Slices selected chapters into batches of `batchSize` (e.g., 10).
     - Downloads each continuous `.mp4` file sequentially with live progress feedback.
     - Indexes chapter records in IndexedDB for synchronized in-app offline playback.

---

## Verification Plan

### Automated & Build Verification
1. **Compilation Check**: Co-execute `compile_applet` and `lint_applet` to confirm zero build and TypeScript errors.
2. **FFmpeg Validation**: Verify FFmpeg generates valid `.mp4` files from synthesized audio streams.

### Manual & Feature Verification
1. **Chapter Selector Verification**:
   - Open Reading Settings, expand the Offline Audio card, and click **"Download Chapters"**.
   - Verify the chapter list modal matches the layout of the screenshot with chapter title, paragraph count, and selection checkboxes.
   - Verify filter search works smoothly (`Filter chapters...`).
   - Test "Select Next 10" and "Select All" buttons.
2. **Continuous Multi-Chapter MP4 Bundling (50 $\rightarrow$ 5 Files)**:
   - Select 50 chapters, enable continuous download with batch size = 10.
   - Verify UI explicitly displays: *"50 chapters selected $\rightarrow$ 5 MP4 files (10 chapters per file)"*.
   - Click Download; verify each continuous batch of 10 chapters is synthesized and downloaded as `.mp4` files:
     - `Chapters_001-010.mp4`
     - `Chapters_011-020.mp4`
     - etc.
3. **MP4 Audio Playback Verification**:
   - Open downloaded `.mp4` files in native media player; confirm audio is continuous, clear, and chapters transition without gaps.
4. **Voice Options Modal Verification**:
   - Open Voice Options modal; confirm the offline audio tab is removed and the original 4 tabs remain clean and intact.
5. **Screen-Off & In-App Offline Playback**:
   - Confirm downloaded chapters remain playable inside the app with text highlighting sync and screen-off lock screen media controls.
