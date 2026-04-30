// engines/audio-analytics.js
// Pure DSP audio analysis — no external model needed.
// Extracts: speaking pace, volume, silence, energy sparkline.

/**
 * Analyze a decoded audio buffer and return metrics.
 * @param {Float32Array} samples — mono PCM samples (16kHz recommended)
 * @param {number} sampleRate — sample rate of the audio
 * @param {number} wordCount — number of words in transcript (for pace calc)
 * @returns {object} metrics
 */
export function analyzeAudio(samples, sampleRate = 16000, wordCount = 0) {
  const duration = samples.length / sampleRate; // seconds

  // ── RMS Energy (overall volume) ──────────────────────────────────────
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  const rms = Math.sqrt(sumSq / samples.length);
  const avgVolumeDb = 20 * Math.log10(Math.max(rms, 1e-10));

  // ── Peak amplitude ───────────────────────────────────────────────────
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-10));
  
  // Convert dBFS (Full Scale, negative values) to a 0-100% loudness index for the UI
  // Usually, -60dB is silence, 0dB is maximum loudness.
  const dbToPct = (db) => Math.max(0, Math.min(100, Math.round((db + 60) * (100 / 60))));
  const avgVolumePct = dbToPct(avgVolumeDb);
  const peakPct = dbToPct(peakDb);

  // ── Energy per window (for sparkline + silence detection) ────────────
  const windowSec = 0.5; // 500ms windows
  const windowSize = Math.floor(sampleRate * windowSec);
  const numWindows = Math.floor(samples.length / windowSize);
  const energyWindows = [];

  for (let w = 0; w < numWindows; w++) {
    const offset = w * windowSize;
    let wSum = 0;
    for (let i = 0; i < windowSize; i++) {
      const s = samples[offset + i];
      wSum += s * s;
    }
    const wRms = Math.sqrt(wSum / windowSize);
    energyWindows.push({
      time: w * windowSec,
      rms: wRms,
      db: 20 * Math.log10(Math.max(wRms, 1e-10)),
    });
  }

  // ── Silence detection ────────────────────────────────────────────────
  // Silence threshold: -40dB below peak, or absolute -50dB
  const silenceThresholdDb = Math.max(peakDb - 40, -50);
  const silenceThreshold = Math.pow(10, silenceThresholdDb / 20);

  const silenceSegments = [];
  let silStart = null;
  let totalSilenceSamples = 0;

  for (let w = 0; w < energyWindows.length; w++) {
    const isSilent = energyWindows[w].rms < silenceThreshold;
    if (isSilent) {
      if (silStart === null) silStart = w;
      totalSilenceSamples += windowSize;
    } else {
      if (silStart !== null) {
        const segDuration = (w - silStart) * windowSec;
        if (segDuration >= 0.5) { // Only count pauses >= 0.5s
          silenceSegments.push({
            start: silStart * windowSec,
            end: w * windowSec,
            duration: segDuration,
          });
        }
        silStart = null;
      }
    }
  }
  // Handle trailing silence
  if (silStart !== null) {
    const segDuration = (numWindows - silStart) * windowSec;
    if (segDuration >= 0.5) {
      silenceSegments.push({
        start: silStart * windowSec,
        end: numWindows * windowSec,
        duration: segDuration,
      });
    }
  }

  const silenceRatio = duration > 0 ? totalSilenceSamples / samples.length : 0;
  const speechDuration = duration * (1 - silenceRatio);

  // ── Speaking pace ────────────────────────────────────────────────────
  const wordsPerMinute = speechDuration > 0 && wordCount > 0
    ? Math.round(wordCount / (speechDuration / 60))
    : 0;

  // Pace classification
  let paceLabel = 'Normal';
  if (wordsPerMinute > 0) {
    if (wordsPerMinute < 100) paceLabel = 'Slow';
    else if (wordsPerMinute < 130) paceLabel = 'Measured';
    else if (wordsPerMinute < 160) paceLabel = 'Normal';
    else if (wordsPerMinute < 190) paceLabel = 'Fast';
    else paceLabel = 'Very Fast';
  }

  // ── Sparkline data (normalized 0-1) ──────────────────────────────────
  const maxEnergy = Math.max(...energyWindows.map(w => w.rms), 1e-10);
  const sparkline = energyWindows.map(w => ({
    time: w.time,
    value: w.rms / maxEnergy, // 0-1 normalized
  }));

  return {
    durationFormatted: formatDuration(duration),
    wordsPerMinute: duration > 0 ? Math.round((wordCount / duration) * 60) : 0,
    paceLabel,
    avgVolumeDb: avgVolumePct, // Returning Pct instead of dB, keeping object key same to not break UI
    peakDb: peakPct,
    silenceRatio: Math.round(silenceRatio * 1000) / 10, // percentage
    silenceSegments,
    pauseCount: silenceSegments.length,
    sparkline: energyWindows.map(w => w.db)
  };
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
