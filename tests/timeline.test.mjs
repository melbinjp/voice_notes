// node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import {
  wordsFromChunks, textFromWords, realign, alignText, activeIndex, cuesFromWords, labelCues, toSrt, toVtt, estimateWords,
} from "../engines/timeline.js";
import { codesFromConfig, whisperCode, bcp47, languageName } from "../engines/languages.js";

const words = [
  { text: "hello", start: 0, end: 0.4 },
  { text: "there", start: 0.5, end: 0.9 },
  { text: "general", start: 1.0, end: 1.5 },
  { text: "kenobi.", start: 1.6, end: 2.2 },
];

test("chunks from Whisper become timed words, skipping empty ones", () => {
  const out = wordsFromChunks([{ text: " hi", timestamp: [0, 0.3] }, { text: " ", timestamp: [0.3, 0.4] }, { text: "you", timestamp: [0.5, null] }]);
  assert.deepEqual(out.map((w) => w.text), ["hi", "you"]);
  assert.ok(out[1].end > out[1].start);
});

test("the active word follows playback time", () => {
  assert.equal(activeIndex(words, 0.2), 0);
  assert.equal(activeIndex(words, 1.2), 2);
  assert.equal(activeIndex(words, 9), -1);
  assert.equal(activeIndex([], 1), -1);
});

test("seeking to a word's start lights that word, not the one before it", () => {
  words.forEach((w, i) => assert.equal(activeIndex(words, w.start), i));
});

test("a corrected word keeps the timing around it", () => {
  const out = realign(words, "hello there general grievous.");
  assert.deepEqual(out.map((w) => w.text), ["hello", "there", "general", "grievous."]);
  assert.equal(out[0].start, 0);
  assert.equal(out[2].start, 1.0);
  assert.ok(out[3].start >= 1.5 && out[3].end <= 2.3);
});

test("a written transcript takes the machine transcript's timings where words match", () => {
  const out = alignText(words, "Hello there, my general Kenobi.");
  assert.equal(out.length, 5);
  assert.equal(out[0].start, 0);
  assert.equal(out[3].start, 1.0);
  assert.ok(out[2].start >= 0.9 && out[2].end <= 1.0 + 1e-9);
  assert.equal(textFromWords(out), "Hello there, my general Kenobi.");
});

test("subtitles come out as valid SRT and VTT", () => {
  const cues = cuesFromWords(words);
  const srt = toSrt(cues);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,200\nhello there general kenobi\.\n$/);
  assert.match(toVtt(cues), /^WEBVTT\n\n00:00:00\.000 --> 00:00:02\.200\n/);
});

test("cues break at long pauses and carry speaker names", () => {
  const spaced = [...words, { text: "later", start: 5, end: 5.5 }];
  const cues = cuesFromWords(spaced);
  assert.equal(cues.length, 2);
  const labeled = labelCues(cues, [{ id: "a", name: "Obi" }, { id: "b", name: "Grievous" }], [
    { speakerId: "a", start: 0, end: 3 },
    { speakerId: "b", start: 4.5, end: 6 },
  ]);
  assert.equal(labeled[1].text, "Grievous: later");
});

test("estimated words spread evenly over the recording", () => {
  const out = estimateWords("one two three four", 8);
  assert.deepEqual(out.map((w) => w.start), [0, 2, 4, 6]);
});

test("languages come from the model config, with Whisper's own codes mapped", () => {
  const codes = codesFromConfig({ lang_to_id: { "<|en|>": 1, "<|ml|>": 2, "<|jw|>": 3 } });
  assert.deepEqual(codes, ["en", "ml", "jw"]);
  assert.equal(bcp47("jw"), "jv");
  assert.equal(whisperCode("jv"), "jw");
  assert.equal(whisperCode("ml-IN"), "ml");
  assert.equal(whisperCode("auto"), "auto");
  assert.equal(languageName("ml", "en"), "Malayalam");
});
