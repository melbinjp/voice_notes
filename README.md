# Voice Notes PWA (AudioPen/VoicePen-like)

A modern, installable, mobile-friendly Progressive Web App for voice notes. Record audio, transcribe speech, summarize via a Cloudflare Worker (Facebook BART), and manage your notes with a beautiful, responsive UI. Works offline, supports install as a PWA, and can be converted to an Android APK.

---

## Features
- **Audio Recording & Transcription**: Record and transcribe voice notes using the Web Speech API.
- **Summarization**: Summarize transcripts via a Cloudflare Worker backend (Facebook BART model).
- **IndexedDB History**: All notes are saved locally and can be exported or deleted.
- **Modern, Responsive UI**: Compact, touch-friendly, and sidebar-free. History is at the bottom as a dropdown list.
- **PWA**: Installable on desktop/mobile, works offline, and supports add-to-home-screen.
- **APK Ready**: Easily convert to an Android APK using PWABuilder.

---

## Getting Started

### 1. Clone & Deploy
```sh
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 2. Structure
- `index.html` — Main HTML file
- `style.css` — App styles
- `app.js` — Main app logic
- `manifest.json` — PWA manifest
- `service-worker.js` — Offline support
- `worker.js` — (Optional) For local summarization logic
- `README.md`, `LICENSE`

### 3. Run Locally
Just open `index.html` in your browser. For full PWA features, use a local server:
```sh
# Python 3
python -m http.server 8080
# Or use VS Code Live Server extension
```

### 4. Deploy to GitHub Pages
- Push all files to your GitHub repo (root or `/docs` folder).
- In repo settings, enable GitHub Pages (root or `/docs`).
- Your app will be live at: `https://<username>.github.io/<repo>/`
- All asset paths are relative for GitHub Pages compatibility.
- Add an empty `.nojekyll` file to the root if you use folders with underscores.

### 5. Install as a PWA
- Visit your GitHub Pages URL in Chrome/Edge/Firefox (desktop or mobile).
- Click the install prompt or use browser menu: "Install App".

### 6. Convert to Android APK
- Go to [PWABuilder](https://www.pwabuilder.com/)
- Enter your GitHub Pages URL.
- Download the generated APK and distribute or upload to Play Store.

---

## Customization
- Update `manifest.json` for your app name, icons, and theme color.
- Update `README.md` and `LICENSE` as needed.
- Backend summarization endpoint is set in `app.js` (`endpoint` variable).

---

## Best Practices
- Use a `.gitignore` to exclude OS/editor files (see below).
- Keep all code and assets in the repo for easy deployment.
- Use Issues and Discussions for feedback and improvements.

---

## .gitignore Example
```
.DS_Store
Thumbs.db
node_modules/
*.log
```

---

## License
MIT (see LICENSE)

---

## Credits
- UI/UX inspired by AudioPen/VoicePen
- Summarization via Facebook BART (Cloudflare Worker)

---

## Contributing
Pull requests and issues are welcome!
