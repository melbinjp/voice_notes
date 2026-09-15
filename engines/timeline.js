// Word timings for a note: play-along highlighting, corrections that keep their timing, and
// subtitle export. A timed word is { text, start, end } in seconds.

export function wordsFromChunks(chunks) {
  return (chunks || [])
    .map((c) => ({
      text: String(c.text || "").trim(),
      start: Number(c.timestamp?.[0]),
      end: Number(c.timestamp?.[1] ?? c.timestamp?.[0]),
    }))
    .filter((w) => w.text && Number.isFinite(w.start))
    // Whisper often leaves the last word without an end time; give it a short one so it can light up.
    .map((w) => ({ ...w, end: Number.isFinite(w.end) && w.end > w.start ? w.end : w.start + 0.3 }));
}

export function textFromWords(words) {
  return (words || []).map((w) => w.text).join(" ").replace(/\s+([,.!?;:])/g, "$1").trim();
}

function tokens(text) {
  return String(text || "").split(/\s+/).filter(Boolean);
}

function norm(word) {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

// Spread words evenly over a duration, for audio that has no word timings yet.
export function estimateWords(text, durationSec) {
  const list = tokens(text);
  if (!list.length || !(durationSec > 0)) return [];
  const step = durationSec / list.length;
  return list.map((t, i) => ({ text: t, start: i * step, end: (i + 1) * step }));
}

// Carry timings onto edited text. Corrections are usually local, so words matching at the start
// and end keep their timing and the changed middle is spread across the time it covered.
export function realign(words, text) {
  const next = tokens(text);
  const old = words || [];
  if (!old.length) return [];
  if (!next.length) return [];
  let head = 0;
  while (head < next.length && head < old.length && norm(next[head]) === norm(old[head].text)) head++;
  let tail = 0;
  while (
    tail < next.length - head &&
    tail < old.length - head &&
    norm(next[next.length - 1 - tail]) === norm(old[old.length - 1 - tail].text)
  ) tail++;
  const out = [];
  for (let i = 0; i < head; i++) out.push({ ...old[i], text: next[i] });
  const midNew = next.slice(head, next.length - tail);
  const midOld = old.slice(head, old.length - tail);
  if (midNew.length) {
    const from = midOld.length ? midOld[0].start : head ? old[head - 1].end : 0;
    const to = midOld.length
      ? midOld[midOld.length - 1].end
      : tail ? old[old.length - tail].start : old[old.length - 1].end;
    const span = Math.max(to - from, 0.2 * midNew.length);
    const step = span / midNew.length;
    midNew.forEach((t, i) => out.push({ text: t, start: from + i * step, end: from + (i + 1) * step }));
  }
  for (let i = old.length - tail; i < old.length; i++) out.push({ ...old[i], text: next[next.length - (old.length - i)] });
  return out;
}

// Put a written transcript onto the timings of a machine transcript of the same audio. Words are
// matched in order (longest common subsequence), and unmatched words share the time between
// their matched neighbours. Very long notes use realign, which is linear.
export function alignText(timed, text) {
  const next = tokens(text);
  const old = timed || [];
  if (!old.length || !next.length) return [];
  const n = next.length;
  const m = old.length;
  if ((n + 1) * (m + 1) > 4e6) return realign(old, text);
  const a = next.map(norm);
  const b = old.map((w) => norm(w.text));
  const W = m + 1;
  const dp = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = a[i] && a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const match = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] && a[i] === b[j]) {
      match[i] = j;
      i++;
      j++;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
    else j++;
  }
  const out = next.map((t) => ({ text: t, start: 0, end: 0 }));
  for (let k = 0; k < n; ) {
    if (match[k] >= 0) {
      out[k].start = old[match[k]].start;
      out[k].end = old[match[k]].end;
      k++;
      continue;
    }
    let e = k;
    while (e < n && match[e] < 0) e++;
    const from = k > 0 ? out[k - 1].end : old[0].start;
    const to = e < n ? old[match[e]].start : old[m - 1].end;
    // Inserted words fit the gap they were spoken in, so they never overlap the next matched word.
    const step = Math.max(to - from, 0.05 * (e - k)) / (e - k);
    for (let x = k; x < e; x++) {
      out[x].start = from + (x - k) * step;
      out[x].end = from + (x - k + 1) * step;
    }
    k = e;
  }
  return out;
}

// Index of the word being spoken at time t, or -1.
export function activeIndex(words, t) {
  let lo = 0;
  let hi = (words?.length || 0) - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (hit < 0) return -1;
  return t <= words[hit].end + 0.25 ? hit : -1;
}

// Subtitle cues: break at a long pause, at sentence ends once a line has some length, or when a
// cue would be too long to read.
export function cuesFromWords(words, { maxChars = 84, maxSeconds = 6, pause = 0.8 } = {}) {
  const cues = [];
  let cur = null;
  for (const w of words || []) {
    const gap = cur ? w.start - cur.end : 0;
    const longer = cur ? `${cur.text} ${w.text}` : w.text;
    if (cur && (gap > pause || longer.length > maxChars || w.end - cur.start > maxSeconds)) {
      cues.push(cur);
      cur = null;
    }
    cur = cur ? { ...cur, text: `${cur.text} ${w.text}`, end: w.end } : { start: w.start, end: w.end, text: w.text };
    if (/[.!?]$/.test(w.text) && cur.text.length > 40) {
      cues.push(cur);
      cur = null;
    }
  }
  if (cur) cues.push(cur);
  return cues;
}

// Prefix each cue with the speaker whose turn covers its start, when a note has speakers.
export function labelCues(cues, speakers, turns) {
  if (!speakers?.length || speakers.length < 2 || !turns?.length) return cues;
  const byId = new Map(speakers.map((s) => [s.id, s.name]));
  return cues.map((c) => {
    const turn = turns.find((t) => c.start >= t.start - 0.2 && c.start < t.end + 0.2);
    const name = turn && byId.get(turn.speakerId);
    return name ? { ...c, text: `${name}: ${c.text}` } : c;
  });
}

function stamp(seconds, separator) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s}${separator}${String(ms % 1000).padStart(3, "0")}`;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`).join("\n");
}

export function toVtt(cues) {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n")}`;
}
