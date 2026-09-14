# Voice Notes — Private studio

A fully offline, client-side voice notebook. Record, transcribe, summarize, tag, and search — nothing leaves the browser.

Live: [melbinjp.github.io/voice_notes](https://melbinjp.github.io/voice_notes/)

## What’s new in v2

The capture surface is now a **studio**, not a stack of cards.

- Split library + editor (notebooks, tags, pin, archive)
- Pause / resume recording, live waveform, Space to capture
- Audio stored with each note in IndexedDB
- Instant on-device summaries (extractive) — no 300 MB download required
- Whisper tiny still available for high-accuracy offline transcription
- Live captions via Web Speech when the browser supports them
- Command palette (`⌘K`), backup / restore, spoken punctuation
- Existing `voiceNotesDB` history is imported automatically

## Privacy

Audio, transcripts, and summaries stay in this origin’s IndexedDB. There is no account and no server. Whisper / DistilBART models, if you opt in, download from Hugging Face once and cache locally.

## Engines

| Engine | Offline | Notes |
| --- | --- | --- |
| Live captions (Web Speech) | No | Fast streaming captions on Chromium |
| Whisper tiny (Transformers.js) | Yes, after first ~40 MB download | File + recording transcription |
| Audio only | Yes | Keep the take, type or dictate later |
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
