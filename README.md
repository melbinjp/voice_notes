# Voice Notes — Private studio

A fully offline, client-side voice notebook. Record, transcribe, separate speakers, speak notes back, tag, and search — nothing leaves the browser.

Live: [melbinjp.github.io/voice_notes](https://melbinjp.github.io/voice_notes/)

## What’s in v2

The capture surface is a **studio**, not a stack of cards.

- Split library + editor (notebooks, tags, pin, archive)
- Pause / resume recording, live waveform, Space to capture
- Audio stored with each note in IndexedDB
- Instant on-device summaries (extractive) — no 300 MB download required
- Whisper tiny for high-accuracy offline transcription
- Live captions via Web Speech when the browser supports them
- **Speaker diarization** — split a take into named turns, or parse `Name:` lines
- **Write a conversation** — Start, type, Enter. Up to four people. Play dialogue.
- **Natural multi-person speech** — Kokoro on-device (Heart / Fenrir). Next line generates while this one plays.
- **Offline Ready** — one tap caches Whisper, Kokoro studio voices, and the app shell
- Command palette (`⌘K`), backup / restore, spoken punctuation
- Mobile recorder chrome (library / record / note)
- Existing `voiceNotesDB` history is imported automatically

## Offline Ready

Tap **Offline Ready** once while on Wi-Fi. That downloads:

- Whisper tiny (~40 MB) for transcription with the radio off
- Kokoro studio voices (WebGPU when available) for natural multi-person speech
- The app shell and workers into the service worker cache
- Persistent storage so the browser is less likely to evict the pack

Live captions still need a connection. Recording, Whisper, speaker labels, summaries, and speech playback do not.

## Privacy

Audio, transcripts, and summaries stay in this origin’s IndexedDB. There is no account and no server. Models, if you opt in, download from Hugging Face / jsDelivr once and cache locally.

## Engines

| Engine | Offline | Notes |
| --- | --- | --- |
| Live captions (Web Speech) | No | Fast streaming captions on Chromium |
| Whisper tiny (Transformers.js) | Yes, after Offline Ready | File + recording transcription |
| Speaker diarization | Yes | On-device clustering from the recording |
| Studio voices | Yes, after Offline Ready | Kokoro neural speech + WAV. System speech is the fallback. |
| System speech | Yes | Fallback read-aloud |
| Extractive summary | Always | Instant, no model |

## Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Start / stop recording |
| `P` | Pause / resume |
| `N` | New note |
| `⌘ K` | Command palette |
| `⌘ ⇧ C` | Copy transcript |
| `⌘ ⇧ M` | Summarize |
| `⌘ ⇧ S` | Speak |
| `⌘ ⇧ O` | Offline Ready |
| `⌘ ⇧ T` | Theme |
| `⌘ ,` | Settings |

## Run locally

Static files, no build:

```bash
npx serve .
```

A local server is required for workers, microphone, and IndexedDB in some browsers.

## GitHub Pages

Settings → Pages → `main` → `/ (root)`.

## License

MIT
