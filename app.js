import {
  applyTheme, getStoredTheme, toggleTheme, applyFontScale, showToast, uid, wordCount,
  titleFromTranscript, formatDuration, dateGroup, summarizeLocal, applyDictationPunctuation,
  exportNote, downloadFile, loadAllNotes, loadFolders, saveNote, saveFolder, deleteNote,
  putAudio, getAudio, getFlag, setFlag, importLegacyNotes, WaveformVisualizer, LANGUAGES, seedLibrary,
} from "./app-utils.js";
import transcriptionQueue from "./engines/transcription-queue.js";
import { diarizeBlob, dialogueText, parseLabeledTranscript } from "./engines/diarize.js";
import {
  STUDIO_VOICES, speakText, speakTurns, stopSpeaking, preloadNeuralTts,
  generateNeuralSpeech, ttsSupported,
} from "./engines/tts.js";

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
  speakingTurn: -1,
  packing: false,
  ttsReady: false,
  whisperReady: false,
  tab: "note",
  settings: {
    theme: getStoredTheme(),
    fontScale: localStorage.getItem("vn:fontScale") || localStorage.getItem("vn-fontsize") || "100",
    language: localStorage.getItem("vn-lang") || "en-US",
    engine: "webspeech",
    autoTitle: true,
    autoSummarize: true,
    autoDiarize: true,
    speakerCount: "auto",
    ttsVoiceId: "af_heart",
    ttsRate: 1,
    dictationPunctuation: true,
  },
};

let recStream, recRecorder, recChunks = [], recMime = "", recSpeech, recTimer, recStarted = 0, recAcc = 0, recFinal = "", recNoteId = null;
let speakAudio = null;

function speechCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function withSpeakers(n) {
  return { ...n, speakers: n.speakers || [], speakerTurns: n.speakerTurns || [], timedWords: n.timedWords || [], tags: n.tags || [] };
}

window.addEventListener("DOMContentLoaded", async () => {
  applyTheme(state.settings.theme);
  applyFontScale(state.settings.fontScale);
  $("fontSizeSlider").value = state.settings.fontScale;
  $("autoTitle").checked = state.settings.autoTitle;
  $("autoSummarize").checked = state.settings.autoSummarize;
  $("autoDiarize").checked = state.settings.autoDiarize;
  $("dictationPunctuation").checked = state.settings.dictationPunctuation;
  $("speakerCount").value = state.settings.speakerCount;
  $("languageSelector").innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${l.name}</option>`).join("");
  $("languageSelector").value = state.settings.language;
  $("ttsVoice").innerHTML = STUDIO_VOICES.map((v) => `<option value="${v.id}">${v.name} · ${v.hint}</option>`).join("");
  $("ttsVoice").value = state.settings.ttsVoiceId;

  await hydrate();
  wire();
  await initEngines();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  window.addEventListener("online", syncOnline);
  window.addEventListener("offline", syncOnline);
  syncOnline();
  if (await getFlag("ttsReady")) {
    state.ttsReady = true;
    updatePackChip();
  }
  if (await getFlag("whisperReady")) state.whisperReady = true;
  if (new URLSearchParams(location.search).get("action") === "record") startRec();
});

function syncOnline() {
  const online = navigator.onLine;
  $("offlineBadge").classList.toggle("hidden", online);
  $("packOnline").textContent = online ? "Online now" : "You are offline";
}

async function hydrate() {
  let notes = await loadAllNotes();
  let folders = await loadFolders();
  const seeded = await getFlag("seeded");
  if (!seeded && notes.length === 0) {
    const legacy = await importLegacyNotes();
    if (legacy.length) {
      notes = legacy.map(withSpeakers);
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
  state.notes = notes.map(withSpeakers);
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
    .filter((n) => !q || n.title.toLowerCase().includes(q) || (n.transcript || "").toLowerCase().includes(q) || (n.speakers || []).some((s) => s.name.toLowerCase().includes(q)))
    .sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1));
}

function updatePackChip() {
  const btn = $("offlineReadyBtn");
  if (!btn) return;
  btn.classList.toggle("ready", state.ttsReady && state.whisperReady);
  btn.textContent = state.ttsReady && state.whisperReady ? "Ready" : state.packing ? "Packing" : "Offline Ready";
}

function render() {
  const shown = visible();
  $("filterAll").textContent = `All ${state.notes.filter((n) => !n.archived).length}`;
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
        <div class="meta"><span>${wordCount(n.transcript)} w</span>${n.durationMs ? `<span>${formatDuration(n.durationMs)}</span>` : ""}${n.speakers?.length > 1 ? `<span>${n.speakers.length} voices</span>` : ""}</div>
        ${n.speakers?.length > 1 ? `<div class="voice-dots">${n.speakers.map((s) => `<span style="background:${s.color}"></span>`).join("")}</div>` : ""}
      </button>`
    ).join("")
  ).join("") : `<p class="muted" style="padding:24px;text-align:center">Nothing here yet</p>`;
  const sel = state.notes.find((n) => n.id === state.selectedId);
  $("tabNoteLabel").textContent = sel?.title ? sel.title.slice(0, 12) : "Note";
  $("statusBar").textContent = `${state.notes.length} notes · stored only on this device · ${state.ttsReady && state.whisperReady ? "offline pack ready" : "tap Offline Ready to cache models"}`;
  updatePackChip();
  renderEditor();
}

function renderEditor() {
  const note = state.notes.find((n) => n.id === state.selectedId);
  const root = $("editorRoot");
  if (!note) {
    root.innerHTML = `<div class="empty-studio"><div class="empty-card">
      <p class="section-label" style="justify-content:center;padding:0">Studio</p>
      <h2>Ready when you are</h2>
      <p>Hold the room. Record, drop a file, or start a blank note. Nothing leaves this device.</p>
      <button class="rec-btn" id="heroRec" aria-label="Start recording">●</button>
      <div class="timer">${formatDuration(state.recMs)}</div>
      <div class="hint">Press Space to record</div>
    </div></div>`;
    $("heroRec")?.addEventListener("click", () => toggleRec());
    return;
  }
  const live = state.rec !== "idle" && recNoteId === note.id;
  const speakers = note.speakers || [];
  const turns = note.speakerTurns || [];
  root.innerHTML = `<article class="editor">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <input class="editor-title" id="titleInput" value="${escAttr(note.title)}" aria-label="Note title" />
      <div style="display:flex;gap:4px">
        <button class="btn-icon" id="pinBtn" title="Pin">${note.pinned ? "unpin" : "pin"}</button>
        <button class="btn-icon" id="sumBtn" title="Summarize">sum</button>
        <button class="btn-icon" id="speakBtn" title="Speak">${state.speakingTurn >= 0 ? "stop" : "speak"}</button>
      </div>
    </div>
    <div class="editor-meta">
      <span>${new Date(note.updatedAt).toLocaleString()}</span>
      <span>${wordCount(note.transcript)} words</span>
      ${note.durationMs ? `<span>${formatDuration(note.durationMs)}</span>` : ""}
      <span>${note.engine || ""}</span>
      ${speakers.length > 1 ? `<span>${speakers.length} speakers</span>` : ""}
    </div>
    ${live ? `<div style="border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;text-align:center">
      <canvas id="wave" width="640" height="64"></canvas>
      <button class="rec-btn live" id="heroRec" aria-label="Stop recording">■</button>
      <div class="timer">${formatDuration(state.recMs)}</div>
    </div>` : ""}
    ${note.audioId && !live ? `<div class="audio-bar" id="audioBar"></div>` : ""}
    <div class="listen-bar">
      <button class="btn btn-sm ${state.speakingTurn >= 0 ? "btn-record" : "btn-secondary"}" id="listenBtn">${speakers.length > 1 ? "Play dialogue" : "Listen"}</button>
      <button class="btn btn-ghost btn-sm" id="wavBtn">WAV</button>
      <select id="voiceSelect">${STUDIO_VOICES.map((v) => `<option value="${v.id}" ${v.id === state.settings.ttsVoiceId ? "selected" : ""}>${v.name} · ${v.hint}</option>`).join("")}</select>
      ${state.ttsReady ? "" : `<button class="btn btn-ghost btn-sm" id="needPack">Neural voices need Offline Ready</button>`}
    </div>
    <div class="tags" id="noteTags">${(note.tags || []).map((t) => `<button class="chip" data-rmtag="${esc(t)}">${esc(t)} ×</button>`).join("")}
      <input id="tagDraft" placeholder="Add tag" style="border:0;background:transparent;color:inherit;width:7rem;font-size:12px;outline:none" />
    </div>
    <div class="tabs">
      <button class="active" data-pane="text">Transcript</button>
      <button data-pane="speakers">Speakers${speakers.length ? ` · ${speakers.length}` : ""}</button>
    </div>
    <div id="pane-text">
      <textarea class="transcript" id="transcript">${esc(note.transcript)}</textarea>
    </div>
    <div id="pane-speakers" class="hidden">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:12px">
        <p class="muted" style="font-size:0.875rem">${speakers.length ? "Rename anyone. Each speaker keeps a studio voice for playback." : "Separate overlapping voices, or write turns as “Name: …”."}</p>
        <button class="btn btn-secondary btn-sm" id="diarizeBtn">${speakers.length ? "Re-identify" : "Identify speakers"}</button>
      </div>
      ${speakers.length ? `<div class="speaker-grid">${speakers.map((s) => `
        <div class="speaker-card" data-sp="${s.id}">
          <span class="dot" style="background:${s.color}"></span>
          <input value="${escAttr(s.name)}" data-rename="${s.id}" aria-label="Speaker name" />
          <select data-voice="${s.id}">${STUDIO_VOICES.map((v) => `<option value="${v.id}" ${v.id === s.voiceId ? "selected" : ""}>${v.name}</option>`).join("")}</select>
        </div>`).join("")}</div>` : ""}
      ${turns.length ? `<ol style="list-style:none;margin-top:16px">${turns.map((t, i) => {
        const sp = speakers.find((s) => s.id === t.speakerId);
        return `<li class="turn ${state.speakingTurn === i ? "active" : ""}" style="border-left-color:${sp?.color || "var(--border-strong)"}">
          <header><span style="color:${sp?.color || "inherit"}">${esc(sp?.name || "Speaker")}</span><span class="muted">${formatDuration(t.start * 1000)}</span></header>
          <p>${esc(t.text || "—")}</p>
        </li>`;
      }).join("")}</ol>` : `<p class="muted" style="border:1px dashed var(--border);border-radius:12px;padding:24px;text-align:center">${note.audioId ? "Identify speakers to split this take into a conversation." : "Label lines with a name and a colon, then identify speakers."}</p>`}
    </div>
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
  $("speakBtn")?.addEventListener("click", () => speakNote(note));
  $("listenBtn")?.addEventListener("click", () => speakNote(note));
  $("wavBtn")?.addEventListener("click", () => downloadSpeech(note));
  $("needPack")?.addEventListener("click", () => $("packModal").classList.add("open"));
  $("voiceSelect")?.addEventListener("change", (e) => { state.settings.ttsVoiceId = e.target.value; });
  $("diarizeBtn")?.addEventListener("click", () => diarizeNote(note.id));
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
  root.querySelectorAll("[data-rename]").forEach((inp) => inp.addEventListener("change", async (e) => {
    const speakers = note.speakers.map((s) => s.id === e.target.dataset.rename ? { ...s, name: e.target.value } : s);
    const transcript = note.speakerTurns.length > 1 ? dialogueText(speakers, note.speakerTurns) : note.transcript;
    await patch(note.id, { speakers, transcript });
  }));
  root.querySelectorAll("[data-voice]").forEach((sel) => sel.addEventListener("change", (e) => {
    const speakers = note.speakers.map((s) => s.id === e.target.dataset.voice ? { ...s, voiceId: e.target.value } : s);
    patch(note.id, { speakers });
  }));
  root.querySelectorAll("[data-pane]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-pane]").forEach((x) => x.classList.toggle("active", x === b));
    $("pane-text").classList.toggle("hidden", b.dataset.pane !== "text");
    $("pane-speakers").classList.toggle("hidden", b.dataset.pane !== "speakers");
  }));
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
  state.notes = state.notes.map((n) => n.id === id ? withSpeakers({ ...n, ...p, updatedAt: Date.now() }) : n);
  const n = state.notes.find((x) => x.id === id);
  if (n) await saveNote(n);
  render();
}

async function createNote(partial = {}) {
  const now = Date.now();
  const note = withSpeakers({
    id: uid(), title: "Untitled note", transcript: "", summary: "", tags: [], folderId: state.folderId,
    pinned: false, archived: false, createdAt: now, updatedAt: now, durationMs: 0, engine: "manual",
    language: state.settings.language, timedWords: [], audioId: null, audioMime: null,
    speakers: [], speakerTurns: [], ...partial,
  });
  state.notes = [note, ...state.notes];
  state.selectedId = note.id;
  state.tab = "note";
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

async function diarizeNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  try {
    if (note.audioId) {
      const rec = await getAudio(note.audioId);
      if (!rec) throw new Error("Audio is missing for this note");
      const k = state.settings.speakerCount === "auto" ? "auto" : Number(state.settings.speakerCount);
      const result = await diarizeBlob(rec.blob, { k, timedWords: note.timedWords, transcript: note.transcript });
      const transcript = result.turns.some((t) => t.text) && result.speakers.length > 1
        ? dialogueText(result.speakers, result.turns)
        : note.transcript;
      await patch(id, { speakers: result.speakers, speakerTurns: result.turns, timedWords: result.timedWords.length ? result.timedWords : note.timedWords, transcript });
      showToast(result.speakers.length > 1 ? `Separated ${result.speakers.length} speakers` : "One speaker throughout");
    } else if (note.transcript) {
      const labeled = parseLabeledTranscript(note.transcript);
      if (!labeled) { showToast("Need a recording, or label turns like “Alex: …”"); return; }
      await patch(id, { speakers: labeled.speakers, speakerTurns: labeled.turns });
      showToast(`Found ${labeled.speakers.length} speakers in the transcript`);
    } else showToast("Record or drop audio first");
  } catch (err) {
    showToast(err.message || "Could not separate speakers");
  }
}

function stopSpeakAudio() {
  stopSpeaking();
  if (speakAudio) {
    speakAudio.pause();
    speakAudio.src = "";
    speakAudio = null;
  }
  state.speakingTurn = -1;
}

async function speakNote(note) {
  const sel = window.getSelection()?.toString().trim();
  const byId = new Map((note.speakers || []).map((s) => [s.id, s]));
  const turns = !sel && note.speakerTurns?.length > 1
    ? note.speakerTurns.map((t) => ({ text: t.text, voiceId: byId.get(t.speakerId)?.voiceId || state.settings.ttsVoiceId }))
    : [{ text: sel || note.transcript.trim(), voiceId: state.settings.ttsVoiceId }];
  if (!turns.some((t) => t.text.trim())) { showToast("Nothing to speak"); return; }
  stopSpeakAudio();
  state.speakingTurn = 0;
  render();
  try {
    if (state.ttsReady && !sel) {
      showToast("Rendering studio voices…");
      const blob = await generateNeuralSpeech(turns, { speed: state.settings.ttsRate });
      const url = URL.createObjectURL(blob);
      speakAudio = new Audio(url);
      speakAudio.onended = () => { state.speakingTurn = -1; render(); };
      await speakAudio.play();
      return;
    }
    if (!ttsSupported()) { showToast("Speech is not available"); return; }
    await speakTurns(turns, { rate: state.settings.ttsRate, onTurn: (i) => { state.speakingTurn = i; } });
  } catch (err) {
    showToast(err.message || "Could not speak");
  } finally {
    if (!speakAudio) { state.speakingTurn = -1; render(); }
  }
}

async function downloadSpeech(note) {
  if (!note.transcript.trim()) { showToast("Nothing to speak"); return; }
  if (!state.ttsReady) { $("packModal").classList.add("open"); showToast("Download Offline Ready first to export studio voices"); return; }
  try {
    const byId = new Map((note.speakers || []).map((s) => [s.id, s]));
    const turns = note.speakerTurns?.length
      ? note.speakerTurns.map((t) => ({ text: t.text, voiceId: byId.get(t.speakerId)?.voiceId || state.settings.ttsVoiceId }))
      : [{ text: note.transcript, voiceId: state.settings.ttsVoiceId }];
    const blob = await generateNeuralSpeech(turns, { speed: state.settings.ttsRate });
    downloadFile(`${(note.title || "voice").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.wav`, blob, "audio/wav");
    showToast("Speech saved as WAV");
  } catch (err) {
    showToast(err.message || "Could not generate speech");
  }
}

async function prepareOffline() {
  if (state.packing) return;
  state.packing = true;
  updatePackChip();
  $("packModal").classList.add("open");
  $("downloadPackBtn").disabled = true;
  try {
    if (navigator.storage?.persist) {
      const ok = await navigator.storage.persist();
      await setFlag("storagePersisted", ok);
      setPackRow("packPersist", ok);
    }
    if ("caches" in window) {
      const cache = await caches.open("voice-notes-v13");
      await Promise.all([
        "./", "./index.html", "./app.js", "./app-utils.js", "./style.css",
        "./engines/tts-worker.js", "./engines/whisper-worker.js", "./engines/diarize.js", "./engines/tts.js",
      ].map((u) => cache.add(u).catch(() => undefined)));
      setPackRow("packCache", true);
    }
    $("packMeter").classList.remove("hidden");
    setPackRow("packWhisper", false, true);
    const w = new Worker("engines/whisper-worker.js", { type: "module" });
    await new Promise((resolve, reject) => {
      w.onmessage = (ev) => {
        if (ev.data.status === "progress") {
          const pct = ev.data.data?.progress || 0;
          $("packMeterBar").style.width = `${pct}%`;
          $("packWhisperHint").textContent = ev.data.data?.file || "model";
        }
        if (ev.data.status === "preload_done" || ev.data.status === "ready") { w.terminate(); resolve(); }
        if (ev.data.status === "error") { w.terminate(); reject(new Error(ev.data.error)); }
      };
      w.postMessage({ action: "preload", id: "preload" });
    }).catch(() => showToast("Whisper will download on first transcription"));
    state.whisperReady = true;
    await setFlag("whisperReady", true);
    setPackRow("packWhisper", true);
    setPackRow("packTts", false, true);
    await preloadNeuralTts((p) => {
      if (p.status === "progress") {
        $("packMeterBar").style.width = `${p.progress || 8}%`;
        $("packTtsHint").textContent = p.file || "voices";
      }
    });
    state.ttsReady = true;
    await setFlag("ttsReady", true);
    setPackRow("packTts", true);
    $("packMeter").classList.add("hidden");
    showToast("This device is ready to work offline");
  } catch (err) {
    showToast(err.message || "Could not prepare offline pack");
  } finally {
    state.packing = false;
    $("downloadPackBtn").disabled = state.ttsReady && state.whisperReady;
    $("downloadPackBtn").textContent = state.ttsReady && state.whisperReady ? "Packed" : "Download pack";
    updatePackChip();
    render();
  }
}

function setPackRow(id, ready, loading) {
  const el = $(id);
  if (!el) return;
  el.textContent = ready ? "Ready" : loading ? "Loading" : "Needed";
  el.className = ready ? "ready" : loading ? "loading" : "";
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
    if (b) { state.selectedId = b.dataset.id; state.tab = "note"; $("sidebar").classList.remove("open"); render(); }
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
  $("menuBtn").onclick = () => { $("sidebar").classList.add("open"); state.tab = "library"; };
  $("offlineReadyBtn").onclick = () => $("packModal").classList.add("open");
  $("openPackBtn").onclick = () => { $("settingsModal").classList.remove("open"); $("packModal").classList.add("open"); };
  $("downloadPackBtn").onclick = () => prepareOffline();
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
  $("autoDiarize").onchange = (e) => state.settings.autoDiarize = e.target.checked;
  $("dictationPunctuation").onchange = (e) => state.settings.dictationPunctuation = e.target.checked;
  $("speakerCount").onchange = (e) => state.settings.speakerCount = e.target.value;
  $("ttsVoice").onchange = (e) => state.settings.ttsVoiceId = e.target.value;
  $("sidebarRecordBtn").onclick = () => toggleRec();
  $("tabRecord").onclick = () => toggleRec();
  $("tabLibrary").onclick = () => { $("sidebar").classList.add("open"); state.tab = "library"; $("tabLibrary").classList.add("active"); $("tabNote").classList.remove("active"); };
  $("tabNote").onclick = () => { $("sidebar").classList.remove("open"); state.tab = "note"; $("tabNote").classList.add("active"); $("tabLibrary").classList.remove("active"); };
  $("exportBackupBtn").onclick = () => downloadFile(`voice-notes-backup.json`, JSON.stringify({ version: 2, notes: state.notes, folders: state.folders }, null, 2), "application/json");
  $("importBackupBtn").onclick = () => $("backupFile").click();
  $("backupFile").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const incoming = (data.notes || data).map(withSpeakers);
      for (const n of incoming) { n.id = n.id || uid(); await saveNote(n); }
      state.notes = [...incoming, ...state.notes];
      render();
      showToast(`Imported ${incoming.length} notes`);
    } catch { showToast("Import failed"); }
    e.target.value = "";
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
    if (state.settings.autoDiarize && note.audioId) void diarizeNote(note.id);
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
    if (n) speakNote(n);
  }
  if (meta && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); $("packModal").classList.add("open"); }
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
      { label: "Offline Ready", run: () => $("packModal").classList.add("open") },
      { label: "Identify speakers", run: () => state.selectedId && diarizeNote(state.selectedId) },
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
  if (Ctor && state.settings.engine !== "whisper" && navigator.onLine) {
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
  } else if (!navigator.onLine) {
    showToast("Offline — audio is saved; Whisper will transcribe after you stop.");
  }
  recTimer = setInterval(() => { state.recMs = recAcc + Date.now() - recStarted; const t = document.querySelector(".timer"); if (t) t.textContent = formatDuration(state.recMs); }, 200);
  state.rec = "recording";
  $("fabRec").textContent = "■";
  $("sidebar").classList.remove("open");
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
  const useWhisper = blob && (!recFinal || state.settings.engine === "whisper" || !navigator.onLine);
  if (useWhisper && blob) {
    transcriptionQueue.setLanguage(state.settings.language.startsWith("en") ? "en" : "auto");
    transcriptionQueue.enqueue(blob, note?.title || "Recording");
  } else {
    showToast("Saved to library");
    if (blob && state.settings.autoDiarize) void diarizeNote(recNoteId);
  }
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
