import {
  applyTheme, getStoredTheme, toggleTheme, applyFontScale, showToast, uid, wordCount,
  titleFromTranscript, formatDuration, dateGroup, summarizeLocal, applyDictationPunctuation,
  exportNote, downloadFile, loadAllNotes, loadFolders, saveNote, saveFolder, deleteNote,
  putAudio, getAudio, getFlag, setFlag, importLegacyNotes, WaveformVisualizer, LANGUAGES, seedLibrary,
} from "./app-utils.js";
import transcriptionQueue from "./engines/transcription-queue.js";

const $ = (id) => document.getElementById(id);
const state = {
  notes: [],
  folders: [],
  selectedId: null,
  query: "",
  filter: "all",
  folderId: null,
  tag: null,
  rec: "idle",
  recMs: 0,
  recInterim: "",
  settings: {
    theme: getStoredTheme(),
    fontScale: localStorage.getItem("vn:fontScale") || localStorage.getItem("vn-fontsize") || "100",
    language: localStorage.getItem("vn-lang") || "en-US",
    engine: "webspeech",
    autoTitle: true,
    autoSummarize: true,
    dictationPunctuation: true,
  },
};

let recStream, recRecorder, recChunks = [], recMime = "", recSpeech, recTimer, recStarted = 0, recAcc = 0, recFinal = "", recNoteId = null;

function speechCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

window.addEventListener("DOMContentLoaded", async () => {
  applyTheme(state.settings.theme);
  applyFontScale(state.settings.fontScale);
  $("fontSizeSlider").value = state.settings.fontScale;
  $("autoTitle").checked = state.settings.autoTitle;
  $("autoSummarize").checked = state.settings.autoSummarize;
  $("dictationPunctuation").checked = state.settings.dictationPunctuation;
  $("languageSelector").innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${l.name}</option>`).join("");
  $("languageSelector").value = state.settings.language;

  await hydrate();
  wire();
  await initEngines();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  if (new URLSearchParams(location.search).get("action") === "record") startRec();
});

async function hydrate() {
  let notes = await loadAllNotes();
  let folders = await loadFolders();
  const seeded = await getFlag("seeded");
  if (!seeded && notes.length === 0) {
    const legacy = await importLegacyNotes();
    if (legacy.length) {
      notes = legacy;
      for (const n of notes) await saveNote(n);
    } else {
      const seed = seedLibrary();
      notes = seed.notes;
      folders = seed.folders;
      for (const n of notes) await saveNote(n);
      for (const f of folders) await saveFolder(f);
    }
    await setFlag("seeded", true);
  }
  state.notes = notes;
  state.folders = folders;
  state.selectedId = notes.find((n) => n.pinned)?.id || notes[0]?.id || null;
  render();
}

async function initEngines() {
  await Promise.allSettled([import("./engines/webspeech-engine.js"), import("./engines/whisper-engine.js")]);
  const { default: ModularRecognitionManager } = await import("./modular-recognition-manager.js");
  window.__mgr = new ModularRecognitionManager();
  const engines = await window.__mgr.initializeEngines();
  $("engineSelector").innerHTML = engines.map((e) => `<option value="${e.id}">${e.name}</option>`).join("")
    + `<option value="manual">Audio only, type later</option>`;
  try { await window.__mgr.setEngine("whisper"); state.settings.engine = "whisper"; } catch {}
  try { await window.__mgr.setEngine("webspeech"); state.settings.engine = "webspeech"; } catch {}
  $("engineSelector").value = state.settings.engine;
}

function visible() {
  const q = state.query.trim().toLowerCase();
  return state.notes.filter((n) => {
    if (state.filter === "pinned") return n.pinned && !n.archived;
    if (state.filter === "archived") return n.archived;
    return !n.archived;
  }).filter((n) => state.folderId ? n.folderId === state.folderId : true)
    .filter((n) => state.tag ? (n.tags || []).includes(state.tag) : true)
    .filter((n) => !q || n.title.toLowerCase().includes(q) || (n.transcript || "").toLowerCase().includes(q))
    .sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1));
}

function render() {
  const shown = visible();
  $("filterAll").textContent = `All${state.notes.filter((n) => !n.archived).length}`;
  $("folderList").innerHTML = `<button class="nav-item ${!state.folderId ? "active" : ""}" data-folder="">All notebooks</button>` +
    [...state.folders].sort((a, b) => a.name.localeCompare(b.name)).map((f) =>
      `<button class="nav-item ${state.folderId === f.id ? "active" : ""}" data-folder="${f.id}">${esc(f.name)}</button>`
    ).join("");
  const tags = [...new Set(state.notes.flatMap((n) => n.tags || []))].sort();
  $("tagList").innerHTML = tags.map((t) => `<button class="chip ${state.tag === t ? "active" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("");
  const groups = new Map();
  for (const n of shown) {
    const g = dateGroup(n.updatedAt);
    groups.set(g, [...(groups.get(g) || []), n]);
  }
  $("noteList").innerHTML = shown.length ? [...groups].map(([g, list]) =>
    `<div class="group-label">${g}</div>` + list.map((n) =>
      `<button class="note-item ${n.id === state.selectedId ? "active" : ""}" data-id="${n.id}">
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.transcript || "Empty note")}</p>
        <div class="meta"><span>${wordCount(n.transcript)} w</span>${n.durationMs ? `<span>${formatDuration(n.durationMs)}</span>` : ""}</div>
      </button>`
    ).join("")
  ).join("") : `<p class="muted" style="padding:24px;text-align:center">Nothing here yet</p>`;
  renderEditor();
  $("statusBar").textContent = `${state.notes.length} notes · stored only on this device`;
}

function renderEditor() {
  const note = state.notes.find((n) => n.id === state.selectedId);
  const root = $("editorRoot");
  if (!note) {
    root.innerHTML = `<div class="empty-studio"><div class="empty-card">
      <h2>Ready when you are</h2>
      <p>Record a thought, drop an audio file, or start a blank note. Nothing leaves this device.</p>
      <button class="rec-btn" id="heroRec">●</button>
      <div class="timer">${formatDuration(state.recMs)}</div>
      <div class="hint">Press Space to record</div>
    </div></div>`;
    $("heroRec")?.addEventListener("click", () => toggleRec());
    return;
  }
  const live = state.rec !== "idle" && recNoteId === note.id;
  root.innerHTML = `<article class="editor">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <input class="editor-title" id="titleInput" value="${escAttr(note.title)}" />
      <div style="display:flex;gap:4px">
        <button class="btn-icon" id="pinBtn" title="Pin">${note.pinned ? "unpin" : "pin"}</button>
        <button class="btn-icon" id="sumBtn" title="Summarize">sum</button>
        <button class="btn-icon" id="speakBtn" title="Speak">speak</button>
        <button class="btn-icon" id="moreBtn" title="More">more</button>
      </div>
    </div>
    <div class="editor-meta">
      <span>${new Date(note.updatedAt).toLocaleString()}</span>
      <span>${wordCount(note.transcript)} words</span>
      ${note.durationMs ? `<span>${formatDuration(note.durationMs)}</span>` : ""}
      <span>${note.engine || ""}</span>
    </div>
    ${live ? `<div style="border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;text-align:center">
      <canvas id="wave" width="640" height="64"></canvas>
      <button class="rec-btn live" id="heroRec">■</button>
      <div class="timer">${formatDuration(state.recMs)}</div>
    </div>` : ""}
    ${note.audioId && !live ? `<div class="audio-bar" id="audioBar"></div>` : ""}
    <div class="tags" id="noteTags">${(note.tags || []).map((t) => `<button class="chip" data-rmtag="${esc(t)}">${esc(t)} ×</button>`).join("")}
      <input id="tagDraft" placeholder="Add tag" style="border:0;background:transparent;color:inherit;width:7rem;font-size:12px;outline:none" />
    </div>
    <textarea class="transcript" id="transcript">${esc(note.transcript)}</textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px">
      <span class="section-label" style="padding:0">Summary</span>
      <button class="btn btn-ghost btn-sm" id="sumBtn2">Refresh</button>
    </div>
    <div class="summary-box" id="summaryBox">${esc(note.summary) || "Summaries run on-device from the transcript."}</div>
    <div class="row" style="padding:16px 0 0">
      <button class="btn btn-secondary btn-sm" data-export="md">Markdown</button>
      <button class="btn btn-ghost btn-sm" data-export="txt">Text</button>
      <button class="btn btn-ghost btn-sm" data-export="json">JSON</button>
      <button class="btn btn-ghost btn-sm" id="delBtn">Delete</button>
    </div>
  </article>`;
  $("titleInput")?.addEventListener("input", (e) => patch(note.id, { title: e.target.value }));
  $("transcript")?.addEventListener("input", (e) => patch(note.id, { transcript: e.target.value }));
  $("pinBtn")?.addEventListener("click", () => patch(note.id, { pinned: !note.pinned }));
  $("sumBtn")?.addEventListener("click", () => doSummary(note.id));
  $("sumBtn2")?.addEventListener("click", () => doSummary(note.id));
  $("speakBtn")?.addEventListener("click", () => speak(note.transcript));
  $("delBtn")?.addEventListener("click", async () => {
    if (!confirm("Delete this note?")) return;
    await deleteNote(note.id);
    state.notes = state.notes.filter((n) => n.id !== note.id);
    state.selectedId = state.notes[0]?.id || null;
    render();
    showToast("Note deleted");
  });
  $("tagDraft")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = e.target.value.trim().replace(/^#/, "").toLowerCase();
      if (v && !(note.tags || []).includes(v)) patch(note.id, { tags: [...(note.tags || []), v] });
      e.target.value = "";
    }
  });
  root.querySelectorAll("[data-rmtag]").forEach((b) => b.addEventListener("click", () => patch(note.id, { tags: note.tags.filter((t) => t !== b.dataset.rmtag) })));
  root.querySelectorAll("[data-export]").forEach((b) => b.addEventListener("click", () => exportNote(note, b.dataset.export)));
  $("heroRec")?.addEventListener("click", () => toggleRec());
  if (note.audioId) mountAudio(note.audioId);
}

async function mountAudio(id) {
  const rec = await getAudio(id);
  const bar = $("audioBar");
  if (!rec || !bar) return;
  const url = URL.createObjectURL(rec.blob);
  bar.innerHTML = `<audio controls src="${url}" style="width:100%"></audio>`;
}

async function patch(id, p) {
  state.notes = state.notes.map((n) => n.id === id ? { ...n, ...p, updatedAt: Date.now() } : n);
  const n = state.notes.find((x) => x.id === id);
  if (n) await saveNote(n);
  render();
}

async function createNote(partial = {}) {
  const now = Date.now();
  const note = {
    id: uid(), title: "Untitled note", transcript: "", summary: "", tags: [], folderId: state.folderId,
    pinned: false, archived: false, createdAt: now, updatedAt: now, durationMs: 0, engine: "manual",
    language: state.settings.language, timedWords: [], audioId: null, audioMime: null, ...partial,
  };
  state.notes = [note, ...state.notes];
  state.selectedId = note.id;
  await saveNote(note);
  render();
  return note;
}

async function doSummary(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n?.transcript.trim()) { showToast("Nothing to summarize yet"); return; }
  await patch(id, { summary: summarizeLocal(n.transcript) });
  showToast("Summary ready");
}

function speak(text) {
  if (!text || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = state.settings.language;
  speechSynthesis.speak(u);
}

function typing(el) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function wire() {
  $("newNoteBtn").onclick = () => createNote();
  $("search").oninput = (e) => { state.query = e.target.value; render(); };
  document.querySelectorAll("[data-filter]").forEach((b) => b.onclick = () => { state.filter = b.dataset.filter; document.querySelectorAll("[data-filter]").forEach((x) => x.classList.toggle("active", x === b)); render(); });
  $("folderList").onclick = (e) => {
    const b = e.target.closest("[data-folder]");
    if (!b) return;
    state.folderId = b.dataset.folder || null;
    state.tag = null;
    render();
  };
  $("tagList").onclick = (e) => {
    const b = e.target.closest("[data-tag]");
    if (!b) return;
    state.tag = state.tag === b.dataset.tag ? null : b.dataset.tag;
    render();
  };
  $("noteList").onclick = (e) => {
    const b = e.target.closest("[data-id]");
    if (b) { state.selectedId = b.dataset.id; render(); }
  };
  $("addFolderBtn").onclick = async () => {
    const name = prompt("Notebook name");
    if (!name?.trim()) return;
    const f = { id: uid("f"), name: name.trim(), createdAt: Date.now() };
    state.folders.push(f);
    await saveFolder(f);
    render();
  };
  $("settingsBtn").onclick = () => $("settingsModal").classList.add("open");
  $("shortcutsBtn").onclick = () => $("shortcutsModal").classList.add("open");
  $("commandBtn").onclick = () => openCommand();
  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");
  document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("open"); }));
  $("themeSelect").onchange = (e) => applyTheme(e.target.value);
  $("fontSizeSlider").oninput = (e) => applyFontScale(e.target.value);
  $("languageSelector").onchange = (e) => { state.settings.language = e.target.value; localStorage.setItem("vn-lang", e.target.value); };
  $("engineSelector").onchange = async (e) => {
    state.settings.engine = e.target.value;
    if (e.target.value !== "manual" && window.__mgr) {
      try { await window.__mgr.setEngine(e.target.value); showToast("Engine switched"); } catch (err) { showToast(err.message); }
    }
  };
  $("autoTitle").onchange = (e) => state.settings.autoTitle = e.target.checked;
  $("autoSummarize").onchange = (e) => state.settings.autoSummarize = e.target.checked;
  $("dictationPunctuation").onchange = (e) => state.settings.dictationPunctuation = e.target.checked;
  $("sidebarRecordBtn").onclick = () => toggleRec();
  $("tabRecord").onclick = () => toggleRec();
  $("tabLibrary").onclick = () => { $("sidebar").classList.add("open"); };
  $("tabNote").onclick = () => { $("sidebar").classList.remove("open"); $("topbar").classList.add("show"); };
  $("exportBackupBtn").onclick = () => downloadFile(`voice-notes-backup.json`, JSON.stringify({ version: 1, notes: state.notes, folders: state.folders }, null, 2), "application/json");
  $("importBackupBtn").onclick = () => $("backupFile").click();
  $("backupFile").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const incoming = data.notes || data;
      for (const n of incoming) { n.id = n.id || uid(); await saveNote(n); }
      state.notes = [...incoming, ...state.notes];
      render();
      showToast(`Imported ${incoming.length} notes`);
    } catch { showToast("Import failed"); }
    e.target.value = "";
  };
  $("preloadModelsBtn").onclick = () => {
    const w = new Worker("engines/whisper-worker.js", { type: "module" });
    w.onmessage = (ev) => { if (ev.data.status === "preload_done") { showToast("Whisper is ready offline"); w.terminate(); } };
    w.postMessage({ action: "preload", id: "preload" });
    showToast("Downloading Whisper…");
  };
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm)$/i.test(f.name));
    files.forEach((f) => importAudio(f));
  });
  transcriptionQueue.addEventListener("itemdone", async (e) => {
    const item = e.detail;
    if (!item.transcript) return;
    const note = await createNote({ title: item.name, transcript: item.transcript, engine: "whisper", summary: state.settings.autoSummarize ? summarizeLocal(item.transcript) : "" });
    showToast(`Transcribed “${note.title}”`);
  });
  window.addEventListener("keydown", onKey);
}

function onKey(e) {
  const meta = e.metaKey || e.ctrlKey;
  if (e.key === "Escape") document.querySelectorAll(".modal.open").forEach((m) => m.classList.remove("open"));
  if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); openCommand(); }
  if (meta && e.key === ",") { e.preventDefault(); $("settingsModal").classList.add("open"); }
  if (meta && e.shiftKey && e.key.toLowerCase() === "t") { e.preventDefault(); toggleTheme(); }
  if (meta && e.shiftKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    const n = state.notes.find((x) => x.id === state.selectedId);
    if (n?.transcript) { navigator.clipboard.writeText(n.transcript); showToast("Copied"); }
  }
  if (meta && e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); if (state.selectedId) doSummary(state.selectedId); }
  if (meta && e.shiftKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    const n = state.notes.find((x) => x.id === state.selectedId);
    speak(window.getSelection()?.toString().trim() || n?.transcript);
  }
  if (typing(e.target)) return;
  if (e.key === " " && !e.repeat) { e.preventDefault(); toggleRec(); }
  if (e.key.toLowerCase() === "n") { e.preventDefault(); createNote(); }
  if (e.key.toLowerCase() === "p" && state.rec !== "idle") { e.preventDefault(); state.rec === "recording" ? pauseRec() : resumeRec(); }
}

function openCommand() {
  $("commandModal").classList.add("open");
  const input = $("commandInput");
  const list = $("commandList");
  input.value = "";
  const draw = () => {
    const q = input.value.toLowerCase();
    const actions = [
      { label: "New note", run: () => createNote() },
      { label: "Start recording", run: () => startRec() },
      { label: "Settings", run: () => $("settingsModal").classList.add("open") },
      { label: "Toggle theme", run: () => toggleTheme() },
    ].filter((a) => a.label.toLowerCase().includes(q));
    const notes = visible().filter((n) => n.title.toLowerCase().includes(q)).slice(0, 8);
    list.innerHTML = actions.map((a, i) => `<li><button class="${i === 0 ? "active" : ""}" data-run="a${i}">${esc(a.label)}</button></li>`).join("")
      + notes.map((n) => `<li><button data-note="${n.id}">${esc(n.title)}</button></li>`).join("");
    list.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.note) state.selectedId = b.dataset.note;
      else actions[Number(b.dataset.run.slice(1))]?.run();
      $("commandModal").classList.remove("open");
      render();
    };
  };
  input.oninput = draw;
  draw();
  input.focus();
}

function toggleRec() {
  if (state.rec === "idle") startRec();
  else stopRec();
}

async function startRec() {
  if (state.rec !== "idle") return;
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch { showToast("Microphone permission was denied"); return; }
  recMime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  recChunks = []; recFinal = ""; recAcc = 0; recStarted = Date.now();
  let note = state.notes.find((n) => n.id === state.selectedId);
  if (!note || note.transcript || note.audioId) note = await createNote({ title: "Recording", engine: state.settings.engine });
  recNoteId = note.id;
  recRecorder = new MediaRecorder(recStream, recMime ? { mimeType: recMime } : undefined);
  recRecorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  recRecorder.start(1000);
  const Ctor = speechCtor();
  if (Ctor && state.settings.engine !== "whisper") {
    recSpeech = new Ctor();
    recSpeech.continuous = true;
    recSpeech.interimResults = true;
    recSpeech.lang = state.settings.language;
    recSpeech.onresult = (ev) => {
      let fin = "", inter = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) fin += ev.results[i][0].transcript;
        else inter += ev.results[i][0].transcript;
      }
      if (fin) {
        recFinal = `${recFinal} ${state.settings.dictationPunctuation ? applyDictationPunctuation(fin) : fin}`.replace(/\s+/g, " ").trim();
        patch(recNoteId, { transcript: recFinal, title: state.settings.autoTitle ? titleFromTranscript(recFinal) : undefined });
      }
      state.recInterim = inter;
    };
    recSpeech.onend = () => { if (state.rec === "recording") try { recSpeech.start(); } catch {} };
    try { recSpeech.start(); } catch {}
  }
  recTimer = setInterval(() => { state.recMs = recAcc + Date.now() - recStarted; const t = document.querySelector(".timer"); if (t) t.textContent = formatDuration(state.recMs); }, 200);
  state.rec = "recording";
  $("fabRec").textContent = "■";
  render();
  const canvas = $("wave");
  if (canvas) new WaveformVisualizer(canvas).start(recStream);
}

function pauseRec() {
  recRecorder?.pause();
  try { recSpeech?.stop(); } catch {}
  recAcc += Date.now() - recStarted;
  state.rec = "paused";
}
function resumeRec() {
  recRecorder?.resume();
  recStarted = Date.now();
  state.rec = "recording";
}

async function stopRec() {
  try { recSpeech?.stop(); } catch {}
  recSpeech = null;
  clearInterval(recTimer);
  const duration = state.rec === "recording" ? recAcc + Date.now() - recStarted : recAcc;
  const blob = await new Promise((resolve) => {
    if (!recRecorder) return resolve(null);
    recRecorder.onstop = () => resolve(recChunks.length ? new Blob(recChunks, { type: recMime || "audio/webm" }) : null);
    try { recRecorder.stop(); } catch { resolve(null); }
  });
  recStream?.getTracks().forEach((t) => t.stop());
  recStream = null; recRecorder = null; recChunks = [];
  state.rec = "idle"; state.recMs = duration; $("fabRec").textContent = "●";
  if (!recNoteId) return;
  const p = { durationMs: duration };
  if (recFinal) {
    p.transcript = recFinal;
    if (state.settings.autoTitle) p.title = titleFromTranscript(recFinal);
  }
  if (blob?.size) { await putAudio(recNoteId, blob, blob.type); p.audioId = recNoteId; p.audioMime = blob.type; }
  await patch(recNoteId, p);
  const note = state.notes.find((n) => n.id === recNoteId);
  if (state.settings.autoSummarize && note?.transcript) await doSummary(recNoteId);
  if (blob && state.settings.engine === "whisper") {
    transcriptionQueue.setLanguage(state.settings.language.startsWith("en") ? "en" : "auto");
    transcriptionQueue.enqueue(blob, note?.title || "Recording");
  } else showToast("Saved to library");
  recNoteId = null;
}

async function importAudio(file) {
  const note = await createNote({ title: file.name.replace(/\.[^.]+$/, ""), engine: "upload" });
  await putAudio(note.id, file, file.type);
  await patch(note.id, { audioId: note.id, audioMime: file.type });
  transcriptionQueue.setLanguage("auto");
  transcriptionQueue.enqueue(file, file.name);
  showToast("Queued for transcription");
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&", "<": "<", ">": ">", '"': """ }[c]));
}
function escAttr(s) { return esc(s).replace(/'/g, "&#39;"); }
