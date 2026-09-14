const SPEAKER_COLORS = ["#d4785a", "#5b8f8a", "#c9a15b", "#7a8aa8"];
const VOICE_CYCLE = ["am_adam", "af_bella", "bm_george", "af_sarah", "am_michael", "bf_emma"];

function uid(prefix = "sp") {
  return `${prefix}_${crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8)}`;
}

async function decodeToFloat32(blob, targetRate = 16000) {
  const buf = await blob.arrayBuffer();
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(buf.slice(0));
  const ch = decoded.getChannelData(0);
  const ratio = decoded.sampleRate / targetRate;
  if (Math.abs(ratio - 1) < 0.01) {
    await ac.close();
    return ch;
  }
  const out = new Float32Array(Math.max(1, Math.floor(ch.length / ratio)));
  for (let i = 0; i < out.length; i++) out[i] = ch[Math.floor(i * ratio)] || 0;
  await ac.close();
  return out;
}

function rms(frame) {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += (frame[i] || 0) ** 2;
  return Math.sqrt(s / Math.max(frame.length, 1));
}

function zcr(frame) {
  let c = 0;
  for (let i = 1; i < frame.length; i++) {
    const a = frame[i - 1] || 0;
    const b = frame[i] || 0;
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) c++;
  }
  return c / frame.length;
}

function pitch(frame, sampleRate) {
  const minLag = Math.floor(sampleRate / 380);
  const maxLag = Math.min(Math.floor(sampleRate / 70), frame.length - 2);
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const n = frame.length - lag;
    for (let i = 0; i < n; i++) sum += (frame[i] || 0) * (frame[i + lag] || 0);
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  return bestLag ? sampleRate / bestLag : 0;
}

function centroid(frame, sampleRate) {
  let num = 0;
  let den = 0;
  const bin = sampleRate / (frame.length * 2);
  for (let i = 0; i < frame.length; i++) {
    const mag = Math.abs(frame[i] || 0);
    num += mag * i * bin;
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

function bands(frame, sampleRate) {
  const low = [0, 0], mid = [0, 0], high = [0, 0];
  const ny = sampleRate / 2;
  for (let i = 0; i < frame.length; i++) {
    const f = (i / frame.length) * ny;
    const mag = Math.abs(frame[i] || 0);
    if (f < 500) {
      low[0] += mag;
      low[1]++;
    } else if (f < 2000) {
      mid[0] += mag;
      mid[1]++;
    } else {
      high[0] += mag;
      high[1]++;
    }
  }
  return [low[1] ? low[0] / low[1] : 0, mid[1] ? mid[0] / mid[1] : 0, high[1] ? high[0] / high[1] : 0];
}

function standardize(points) {
  if (!points.length) return points;
  const dim = points[0].length;
  const mean = new Array(dim).fill(0);
  const sd = new Array(dim).fill(0);
  for (const p of points) for (let i = 0; i < dim; i++) mean[i] += p[i] || 0;
  for (let i = 0; i < dim; i++) mean[i] /= points.length;
  for (const p of points) for (let i = 0; i < dim; i++) sd[i] += ((p[i] || 0) - mean[i]) ** 2;
  for (let i = 0; i < dim; i++) sd[i] = Math.sqrt(sd[i] / points.length) || 1;
  return points.map((p) => p.map((v, i) => (v - mean[i]) / sd[i]));
}

function kmeans(points, k, iters = 24) {
  if (!points.length) return [];
  const dim = points[0].length;
  const centers = [[...points[Math.floor(Math.random() * points.length)]]];
  while (centers.length < k) {
    const weights = points.map((p) => {
      let best = Infinity;
      for (const c of centers) {
        let d = 0;
        for (let i = 0; i < dim; i++) d += ((p[i] || 0) - (c[i] || 0)) ** 2;
        if (d < best) best = d;
      }
      return best;
    });
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * sum;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centers.push([...points[idx]]);
  }
  const labels = new Array(points.length).fill(0);
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        let d = 0;
        for (let j = 0; j < dim; j++) d += ((p[j] || 0) - (centers[c][j] || 0)) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      labels[i] = best;
    }
    const sums = centers.map(() => new Array(dim).fill(0));
    const counts = centers.map(() => 0);
    for (let i = 0; i < points.length; i++) {
      counts[labels[i]]++;
      for (let j = 0; j < dim; j++) sums[labels[i]][j] += points[i][j] || 0;
    }
    for (let c = 0; c < centers.length; c++) {
      if (!counts[c]) continue;
      for (let j = 0; j < dim; j++) centers[c][j] = sums[c][j] / counts[c];
    }
  }
  return labels;
}

function centerDistance(points, labels) {
  const k = Math.max(...labels, 0) + 1;
  const dim = points[0]?.length || 0;
  const centers = Array.from({ length: k }, () => new Array(dim).fill(0));
  const counts = new Array(k).fill(0);
  for (let i = 0; i < points.length; i++) {
    counts[labels[i]]++;
    for (let j = 0; j < dim; j++) centers[labels[i]][j] += points[i][j] || 0;
  }
  for (let c = 0; c < k; c++) {
    if (!counts[c]) continue;
    for (let j = 0; j < dim; j++) centers[c][j] /= counts[c];
  }
  if (k < 2) return 0;
  let d = 0;
  for (let j = 0; j < dim; j++) d += ((centers[0][j] || 0) - (centers[1][j] || 0)) ** 2;
  return Math.sqrt(d);
}

function makeSpeakers(k) {
  return Array.from({ length: k }, (_, i) => ({
    id: uid("sp"),
    name: `Speaker ${i + 1}`,
    color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
    voiceId: VOICE_CYCLE[i % VOICE_CYCLE.length],
  }));
}

export function parseLabeledTranscript(text) {
  const re = /^(?:\[)?([A-Z][A-Za-z0-9 .'-]{0,28})(?:\])?:\s+(.+)$/gm;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const name = (m[1] || "").trim();
    const body = (m[2] || "").trim();
    if (name && body && !/^(the|and|but|this|that|with)$/i.test(name)) found.push({ name, text: body });
  }
  if (found.length < 2) return null;
  const names = [];
  for (const f of found) if (!names.includes(f.name)) names.push(f.name);
  if (names.length < 2) return null;
  const speakers = names.slice(0, 4).map((name, i) => ({
    id: uid("sp"),
    name,
    color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
    voiceId: VOICE_CYCLE[i % VOICE_CYCLE.length],
  }));
  const byName = new Map(speakers.map((s) => [s.name, s]));
  let t = 0;
  const turns = found.map((f) => {
    const sp = byName.get(f.name) || speakers[0];
    const dur = Math.max(1.4, f.text.split(/\s+/).length * 0.38);
    const turn = { speakerId: sp.id, start: t, end: t + dur, text: f.text };
    t += dur + 0.25;
    return turn;
  });
  return { speakers, turns };
}

export function dialogueText(speakers, turns) {
  const byId = new Map(speakers.map((s) => [s.id, s]));
  return turns
    .map((t) => `${byId.get(t.speakerId)?.name || "Speaker"}: ${t.text}`.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function diarizeBlob(blob, opts = {}) {
  const audio = await decodeToFloat32(blob, 16000);
  const sr = 16000;
  const frame = 512;
  const hop = 256;
  const energies = [];
  for (let i = 0; i + frame < audio.length; i += hop) energies.push(rms(audio.subarray(i, i + frame)));
  const sorted = [...energies].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.2)] || 0.01;
  const thresh = Math.max(noise * 3.2, 0.012);
  const speech = energies.map((e) => e > thresh);
  let run = 0;
  for (let i = 0; i < speech.length; i++) {
    if (speech[i]) run = 6;
    else if (run > 0) {
      speech[i] = true;
      run--;
    }
  }
  const raw = [];
  let s0 = -1;
  for (let i = 0; i <= speech.length; i++) {
    if (speech[i] && s0 < 0) s0 = i;
    if ((!speech[i] || i === speech.length) && s0 >= 0) {
      const start = (s0 * hop) / sr;
      const end = (i * hop) / sr;
      if (end - start >= 0.28) raw.push({ start, end });
      s0 = -1;
    }
  }
  const merged = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.end < 0.35) last.end = seg.end;
    else merged.push({ ...seg });
  }

  if (!merged.length) {
    const labeled = opts.transcript ? parseLabeledTranscript(opts.transcript) : null;
    if (labeled) return { speakers: labeled.speakers, turns: labeled.turns, timedWords: opts.timedWords || [] };
    const speakers = makeSpeakers(1);
    const text = (opts.transcript || "").trim();
    return {
      speakers,
      turns: text ? [{ speakerId: speakers[0].id, start: 0, end: audio.length / sr, text }] : [],
      timedWords: opts.timedWords || [],
    };
  }

  const segs = merged.map((seg) => {
    const a = Math.floor(seg.start * sr);
    const b = Math.min(audio.length, Math.floor(seg.end * sr));
    const slice = audio.subarray(a, b);
    const mid = slice.subarray(Math.max(0, Math.floor(slice.length * 0.25)), Math.min(slice.length, Math.floor(slice.length * 0.75)) || slice.length);
    const window = mid.length > 1024 ? mid.subarray(0, 1024) : mid;
    const [lo, mi, hi] = bands(window, sr);
    return { start: seg.start, end: seg.end, feat: [pitch(window, sr), centroid(window, sr), zcr(window), rms(window), lo, mi, hi] };
  });

  const feats = standardize(segs.map((s) => s.feat));
  let k = opts.k === "auto" || opts.k == null ? 2 : opts.k;
  k = Math.max(1, Math.min(k, Math.min(4, segs.length)));
  let labels = k === 1 ? segs.map(() => 0) : kmeans(feats, k);
  if ((opts.k === "auto" || opts.k == null) && centerDistance(feats, labels) < 0.55) {
    k = 1;
    labels = segs.map(() => 0);
  }
  for (let i = 1; i < labels.length - 1; i++) {
    if (labels[i] !== labels[i - 1] && labels[i] !== labels[i + 1]) labels[i] = labels[i - 1];
  }

  const speakers = makeSpeakers(k);
  const words = [...(opts.timedWords || [])];
  const turns = segs.map((seg, i) => {
    const speakerId = speakers[labels[i]]?.id || speakers[0].id;
    const overlapping = words.filter((w) => w.end > seg.start && w.start < seg.end);
    for (const w of overlapping) w.speakerId = speakerId;
    return { speakerId, start: seg.start, end: seg.end, text: overlapping.map((w) => w.word).join(" ").trim() };
  });

  if (!words.length && opts.transcript) {
    const sentences = opts.transcript.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    if (sentences.length) {
      const total = turns.reduce((n, t) => n + (t.end - t.start), 0) || 1;
      let cursor = 0;
      const units = turns.map((t) => Math.max(1, Math.round((sentences.length * (t.end - t.start)) / total)));
      let used = units.reduce((a, b) => a + b, 0);
      while (used > sentences.length) {
        const idx = units.findIndex((u) => u > 1);
        if (idx < 0) break;
        units[idx]--;
        used--;
      }
      for (let i = 0; i < turns.length; i++) {
        turns[i].text = sentences.slice(cursor, cursor + (units[i] || 0)).join(" ");
        cursor += units[i] || 0;
      }
      if (cursor < sentences.length && turns.length) turns[turns.length - 1].text += " " + sentences.slice(cursor).join(" ");
    }
  }

  const collapsed = [];
  for (const t of turns) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.speakerId === t.speakerId && t.start - last.end < 0.8) {
      last.end = t.end;
      last.text = `${last.text} ${t.text}`.replace(/\s+/g, " ").trim();
    } else collapsed.push({ ...t });
  }
  return { speakers, turns: collapsed.filter((t) => t.text || t.end - t.start > 0.4), timedWords: words };
}
