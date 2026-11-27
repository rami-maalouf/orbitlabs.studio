// the page's player: a voice sample, or the visitor's own text generated in a worker.
// the waveform is the scrubber, and the mac player's shortcuts work here too.
const el = (id) => document.getElementById(id);
const SAMPLE = "assets/heart.wav";
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const BARS = 56;
// what the wave shows before any audio exists for the visitor's text.
const FLAT = Array(BARS).fill(0.12);

const player = new Audio(SAMPLE);
player.preload = "metadata";
const wave = el("wave");
const canvas = wave.querySelector("canvas");

let own = false;
let pending = false;
let rate = 2;
let readyText = "";
let objectUrl = null;
let worker = null;
let samplePeaks = FLAT;
let peaks = FLAT;
let frame = 0;

// any number of peaks, drawn as BARS bars.
function fit(source) {
  return Array.from({ length: BARS }, (_, i) => {
    const from = Math.floor((i * source.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * source.length) / BARS));
    return Math.max(...source.slice(from, to));
  });
}

const clock = (seconds) => {
  const t = Math.floor(seconds || 0);
  return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
};

const progress = () => (player.duration ? player.currentTime / player.duration : 0);

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = devicePixelRatio || 1;
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const style = getComputedStyle(wave);
  const played = style.getPropertyValue("--ink");
  const rest = style.getPropertyValue("--bars");
  const pitch = width / BARS;
  const bar = pitch / 2;
  const at = progress();
  peaks.forEach((peak, i) => {
    const h = Math.max(bar, peak * height);
    ctx.fillStyle = (i + 0.5) / BARS <= at ? played : rest;
    ctx.beginPath();
    ctx.roundRect(i * pitch + bar / 2, (height - h) / 2, bar, h, bar / 2);
    ctx.fill();
  });
  el("clock").textContent = clock(player.currentTime);
  wave.setAttribute("aria-valuenow", String(Math.round(at * 100)));
  wave.setAttribute("aria-valuetext", clock(player.currentTime));
}

// while audio plays, the wave fills every frame instead of four times a second.
function loop() {
  draw();
  frame = player.paused || player.ended ? 0 : requestAnimationFrame(loop);
}

function sync() {
  const playing = !player.paused && !player.ended;
  const label = pending ? "Cancel" : playing ? "Pause" : player.ended ? "Play again" : "Play";
  el("play").dataset.state = pending ? "busy" : playing ? "playing" : "idle";
  el("play").setAttribute("aria-label", label);
  el("rate").textContent = RATES[rate] + "×";
  el("slower").disabled = rate === 0;
  el("faster").disabled = rate === RATES.length - 1;
  if (playing && !frame) frame = requestAnimationFrame(loop);
  draw();
}

const say = (text) => (el("message").textContent = text);

function stopJob() {
  if (worker) worker.terminate();
  worker = null;
  pending = false;
}

function forget() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  readyText = "";
}

function setOwn(next) {
  stopJob();
  player.pause();
  forget();
  own = next;
  say("");
  if (own) player.removeAttribute("src");
  else player.src = SAMPLE;
  player.load();
  peaks = own ? FLAT : samplePeaks;
  el("input").hidden = !own;
  el("mode").textContent = own ? "Back to the sample" : "Read your own text";
  if (own) el("input").focus({ preventScroll: true });
  sync();
}

async function start() {
  player.playbackRate = RATES[rate];
  try {
    await player.play();
  } catch {
    say("Press play to start the audio.");
  }
  sync();
}

function failed() {
  stopJob();
  sync();
  say("The voice did not load. Check your connection, then try again.");
}

function generate(text) {
  pending = true;
  sync();
  say("Loading the voice…");
  worker = new Worker("./voice-worker.js", { type: "module" });
  worker.onerror = failed;
  worker.onmessage = ({ data }) => {
    if (data.status) return say(data.status);
    if (data.error) {
      console.warn(data.error);
      return failed();
    }
    stopJob();
    forget();
    readyText = text;
    objectUrl = URL.createObjectURL(data.blob);
    player.src = objectUrl;
    peaks = fit(data.peaks);
    say("");
    start();
  };
  worker.postMessage(text);
}

function toggle() {
  if (pending) {
    stopJob();
    say("");
    return sync();
  }
  if (!player.paused && !player.ended) return player.pause();
  const text = el("input").value.trim();
  if (!own || (objectUrl && readyText === text)) return start();
  if (!text) {
    say("Paste some text first.");
    return el("input").focus();
  }
  generate(text);
}

function seek(seconds) {
  if (!player.duration) return;
  player.currentTime = Math.min(player.duration, Math.max(0, seconds));
  draw();
}

function step(by) {
  rate = Math.min(RATES.length - 1, Math.max(0, rate + by));
  player.playbackRate = RATES[rate];
  sync();
}

el("play").onclick = toggle;
el("mode").onclick = () => setOwn(!own);
el("slower").onclick = () => step(-1);
el("faster").onclick = () => step(1);

el("input").oninput = () => {
  if (pending) stopJob();
  player.pause();
  say("");
  sync();
};

// press or drag anywhere on the wave to move through the audio.
const scrub = (event) => {
  const box = wave.getBoundingClientRect();
  seek(((event.clientX - box.left) / box.width) * player.duration);
};
wave.addEventListener("pointerdown", (event) => {
  if (!player.duration) return;
  wave.setPointerCapture(event.pointerId);
  scrub(event);
});
wave.addEventListener("pointermove", (event) => {
  if (wave.hasPointerCapture(event.pointerId)) scrub(event);
});

// the mac player's shortcuts: space, the arrows, minus and equals.
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLTextAreaElement) return;
  if (event.key === " ") {
    // a focused button already takes the space key.
    if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    toggle();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    seek(player.currentTime - 5);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    seek(player.currentTime + 5);
  } else if (event.key === "-" || event.key === "_") {
    step(-1);
  } else if (event.key === "=" || event.key === "+") {
    step(1);
  }
});

for (const event of ["play", "pause", "ended", "seeked", "loadedmetadata"])
  player.addEventListener(event, sync);

fetch("assets/sample-peaks.json")
  .then((response) => response.json())
  .then((data) => {
    samplePeaks = fit(data);
    if (!own) peaks = samplePeaks;
    draw();
  });

new ResizeObserver(draw).observe(canvas);
sync();
