const el = (id) => document.getElementById(id);
const player = new Audio("assets/heart.wav");
player.preload = "metadata";
let tab = "sample",
  readyText = "",
  objectUrl,
  worker,
  pending = false,
  samplePeaks = [],
  peaks = [];
const canvas = el("wave");
function draw() {
  const width = canvas.clientWidth,
    height = canvas.clientHeight,
    ratio = devicePixelRatio;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const step = width / Math.max(1, peaks.length);
  peaks.forEach((peak, i) => {
    const h = Math.max(3, peak * (height - 12));
    ctx.fillStyle =
      i / peaks.length < player.currentTime / player.duration
        ? "#f9ffd5"
        : "#a4c785";
    ctx.fillRect(i * step, (height - h) / 2, Math.max(1, step - 2), h);
  });
  const t = Math.floor(player.currentTime || 0);
  el("clock").textContent =
    Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
}
fetch("assets/sample-peaks.json")
  .then((r) => r.json())
  .then((p) => {
    samplePeaks = p;
    if (tab === "sample") peaks = p;
    draw();
  });
new ResizeObserver(draw).observe(canvas);
function sync() {
  const playing = !player.paused && !player.ended;
  const title = pending
    ? "Cancel"
    : playing
      ? "Pause"
      : player.ended
        ? "Replay"
        : player.currentTime
          ? "Resume"
          : tab === "sample"
            ? "Play sample"
            : "Read aloud";
  el("verb").textContent = title;
  el("play").setAttribute("aria-label", title);
  el("symbol").textContent = playing ? "Ⅱ" : pending ? "■" : "▶";
  el("indicator").textContent = pending
    ? "Preparing voice"
    : playing
      ? "Playing"
      : player.ended
        ? "Finished"
        : player.currentTime
          ? "Paused"
          : "Ready to play";
  draw();
}
function clearJob() {
  if (worker) worker.terminate();
  worker = null;
  pending = false;
}
function setTab(next) {
  clearJob();
  player.pause();
  tab = next;
  readyText = "";
  el("message").textContent = "";
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  if (next === "sample") player.src = "assets/heart.wav";
  else player.removeAttribute("src");
  player.load();
  peaks = next === "sample" ? samplePeaks : [];
  for (const id of ["sample", "custom"])
    el(id).setAttribute("aria-pressed", String(id === next));
  el("editor").hidden = next !== "custom";
  el("quote").hidden = next === "custom";
  if (next === "custom") el("input").focus({ preventScroll: true });
  sync();
}
async function startAudio() {
  player.playbackRate = parseFloat(el("speed").value);
  try {
    await player.play();
  } catch {
    el("message").textContent = "Press play to start the audio.";
  }
  sync();
}
function failed() {
  clearJob();
  sync();
  el("message").textContent =
    "Couldn’t prepare the voice. Check your connection and try again, or listen to the sample.";
}
el("play").onclick = () => {
  if (pending) {
    clearJob();
    el("message").textContent = "";
    sync();
    return;
  }
  if (!player.paused && !player.ended) {
    player.pause();
    return;
  }
  const text = el("input").value.trim();
  if (tab === "sample" || (objectUrl && readyText === text)) {
    startAudio();
    return;
  }
  if (!text) {
    el("message").textContent = "Paste some text to read.";
    el("input").focus();
    return;
  }
  pending = true;
  sync();
  el("message").textContent = "Loading the local English voice…";
  worker ??= new Worker("./voice-worker.js", { type: "module" });
  worker.onerror = failed;
  worker.onmessage = ({ data }) => {
    if (data.status) {
      el("message").textContent = data.status;
      return;
    }
    if (data.error) {
      console.warn(data.error);
      failed();
      return;
    }
    pending = false;
    readyText = text;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(data.blob);
    player.src = objectUrl;
    peaks = data.peaks;
    el("message").textContent = "";
    startAudio();
  };
  worker.postMessage(text);
};
el("input").oninput = () => {
  if (pending) clearJob();
  player.pause();
  el("message").textContent = "";
  sync();
};
el("sample").onclick = () => setTab("sample");
el("custom").onclick = () => setTab("custom");
el("try").onclick = () => setTab("custom");
el("speed").onchange = () => {
  player.playbackRate = parseFloat(el("speed").value);
};
for (const event of ["play", "pause", "ended", "timeupdate", "loadedmetadata"])
  player.addEventListener(event, sync);
