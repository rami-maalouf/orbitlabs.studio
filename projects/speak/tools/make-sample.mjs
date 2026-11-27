// makes the page's default sample: the title and the sentence under it, in the voice and model the page uses.
// run it again when those words change: bun add kokoro-js@1.2.1 in a scratch folder, bun make-sample.mjs,
// convert heart.wav to 16-bit (afconvert -f WAVE -d LEI16), then copy both files into assets/.
import { KokoroTTS } from "kokoro-js";
import { writeFileSync } from "node:fs";
const parts = ["Simple and fast reader.", "Select text on your Mac and run one Raycast command.", "A natural voice reads it at your speed, on your device."];
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
const clips = [];
for (const part of parts) clips.push(await tts.generate(part, { voice: "af_heart" }));
const rate = clips[0].sampling_rate;
// a short rest after the title, as a reader would take
const gaps = [Math.round(rate * 0.35), Math.round(rate * 0.12), 0];
const frames = new Float32Array(clips.reduce((n, c, i) => n + c.audio.length + gaps[i], 0));
let at = 0;
clips.forEach((c, i) => { frames.set(c.audio, at); at += c.audio.length + gaps[i]; });
const out = new clips[0].constructor(frames, rate);
writeFileSync("heart.wav", Buffer.from(out.toWav()));
const peaks = Array.from({ length: 80 }, (_, i) => {
  let peak = 0;
  for (let j = Math.floor((i * frames.length) / 80); j < Math.floor(((i + 1) * frames.length) / 80); j++) peak = Math.max(peak, Math.abs(frames[j]));
  return peak;
});
const max = Math.max(...peaks, 0.001);
writeFileSync("sample-peaks.json", JSON.stringify(peaks.map((p) => +(p / max).toFixed(3))));
console.log("seconds", frames.length / rate);
