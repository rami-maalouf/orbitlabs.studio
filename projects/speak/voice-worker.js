import { spokenText } from "./assets/spoken-text.js";

let model;
self.onmessage = async ({ data }) => {
  try {
    const passage = spokenText(data).trim();
    if (!passage) throw Error("Paste a passage with words to read.");
    const { KokoroTTS } =
      await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js");
    model ??= await KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-v1.0-ONNX",
      {
        dtype: "q8",
        device: "wasm",
        progress_callback(event) {
          if (
            event.status === "progress" &&
            event.file.endsWith(".onnx") &&
            event.total
          ) {
            self.postMessage({
              status:
                "Downloading voice · " +
                Math.round((event.loaded * 100) / event.total) +
                "%",
            });
          }
        },
      },
    );
    const sentences = passage.match(/[^.!?\n]+[.!?]*|[.!?]+/gu) || [passage];
    const clips = [];
    for (const sentence of sentences) {
      for (const part of sentence.match(/.{1,240}(?:\s+|$)|.{1,240}/gu) || []) {
        self.postMessage({ status: "Generating speech on this device…" });
        const audio = await model.generate(part, { voice: "af_heart" });
        clips.push(audio);
      }
    }
    const frames = new Float32Array(
      clips.reduce((total, clip) => total + clip.audio.length, 0),
    );
    let offset = 0;
    for (const clip of clips) {
      frames.set(clip.audio, offset);
      offset += clip.audio.length;
    }
    const peaks = Array.from({ length: 80 }, (_, i) => {
      const end = Math.floor(((i + 1) * frames.length) / 80);
      let peak = 0;
      for (let j = Math.floor((i * frames.length) / 80); j < end; j++)
        peak = Math.max(peak, Math.abs(frames[j]));
      return peak;
    });
    const max = Math.max(...peaks, 0.001);
    self.postMessage({
      blob: new clips[0].constructor(frames, clips[0].sampling_rate).toBlob(),
      peaks: peaks.map((p) => p / max),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
