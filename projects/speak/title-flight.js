// the title's full stop is a lightning bolt. on load it flies one flight through the title:
// it winds up in a circle left of "fast", dashes through the word behind its letters and charges
// it as it goes, loops once over "reader", glides down and lands on the dot with a bounce.
// then it rests as the full stop, aims at the cursor, and a click launches it again.
// readers who ask for reduced motion see only the resting bolt and the charged word.

const ART = 98; // the bolt in the art points 98 degrees below the horizontal: tip down
const REST = 98; // and rests that way, upright
// wind-up, the dash, the loop, the glide to the dot, the landing
const LEGS = [1.6, 0.6, 0.6, 0.6, 1.4];
const TOTAL = LEGS.reduce((a, b) => a + b, 0);
const COLORS = ["#eaff6b", "#dff7cc", "#ffffff"];
// how far the wind-up turns, and how sharply it speeds up
const TURNS = 540;
const WIND = 2.3;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x) => Math.min(1, Math.max(0, x));
const angleLerp = (a, b, t) => a + (((((b - a) % 360) + 540) % 360) - 180) * t;
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function startTitleFlight() {
  const title = document.getElementById("title");
  const box = title?.parentElement;
  const bolt = box?.querySelector(".title-bolt");
  if (!title || !box || !bolt) return;
  const pick = (name) => title.querySelector(`[data-flight="${name}"]`);
  const marks = { fast: pick("fast"), base: pick("base"), slot: pick("slot") };
  const trail = title.querySelector(".trail");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // where the letters are, in the box's space. the baseline comes from a zero-height marker on it.
  let geo = null;
  let size = 24;
  function measure() {
    const cr = box.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(title).fontSize);
    const f = marks.fast.getBoundingClientRect();
    const base = marks.base.getBoundingClientRect().top - cr.top;
    const s = marks.slot.getBoundingClientRect();
    size = fs * 0.4;
    geo = {
      left: f.left - cr.left,
      width: f.width,
      // the middle of the small letters: the line the dash runs along
      y: base - fs * 0.26,
      stop: { x: s.left - cr.left + s.width / 2, y: base - size * 0.32 },
    };
  }

  // the flight: each leg is a function of its own 0..1. every leg starts where the last one
  // ends, moving the same way, so the bolt never turns a corner.
  function path(t) {
    const { left, width, y, stop: S } = geo;
    const R1 = size * 1.3;
    const R2 = size * 1.5;
    const C1 = { x: left - size * 2.4, y: y - R1 }; // the wind-up circle, left of the word
    const C2 = { x: lerp(left + width, S.x, 0.45), y: y - R2 }; // the loop, over "reader"
    const on = (c, r, a) => ({ x: c.x + Math.cos((a * Math.PI) / 180) * r, y: c.y + Math.sin((a * Math.PI) / 180) * r });
    const legs = [
      // wind-up: one and a half turns, slow to fast, let go at the bottom moving right
      (u) => ({ p: on(C1, R1, 90 + TURNS * (1 - Math.pow(u, WIND))), opacity: clamp(u * 5) }),
      // the dash: straight through the word, behind its letters
      (u) => {
        const x = lerp(C1.x, C2.x, u);
        return { p: { x, y }, heading: 0, behind: true, paint: clamp((x - left) / width) };
      },
      // the loop: up, over the top and back down to the same line
      (u) => ({ p: on(C2, R2, 90 - 360 * u), behind: true }),
      // the glide: slows as it comes down onto the dot
      (u) => ({ p: { x: lerp(C2.x, S.x, 1 - (1 - u) * (1 - u)), y: lerp(y, S.y, easeInOut(u)) }, behind: u < 0.5 }),
      // the landing: a damped spring, pressed into the dot, back up above it, smaller each time
      (u) => {
        const spring = Math.exp(-3.4 * u) * Math.sin(u * 19);
        return { p: { x: S.x, y: S.y + spring * size * 0.75 }, landing: u, spring };
      },
    ];
    let acc = 0;
    for (let i = 0; i < legs.length; i++) {
      if (t <= acc + LEGS[i]) return { ...legs[i]((t - acc) / LEGS[i]), seg: i };
      acc += LEGS[i];
    }
    return { p: S, seg: legs.length };
  }

  function place(p, angle, opacity = 1, squash = 1) {
    bolt.style.width = bolt.style.height = `${size}px`;
    // squash shortens the bolt along its flight line
    bolt.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px) rotate(${angle}deg) scale(${squash}, ${2 - squash}) rotate(${-ART}deg)`;
    bolt.style.opacity = opacity;
  }

  const paint = (share) => (trail.style.clipPath = `inset(0 ${(1 - share) * 100}% 0 0)`);

  function spark(x, y, dirDeg, only) {
    const el = document.createElement("i");
    el.className = "flight-spark";
    const color = only || COLORS[(Math.random() * 3) | 0];
    el.style.background = color;
    el.style.boxShadow = `0 0 6px ${color}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    box.appendChild(el);
    const d = ((dirDeg + (Math.random() * 50 - 25)) * Math.PI) / 180;
    const len = (10 + Math.random() * 24) * (size / 24);
    el.animate(
      [{ transform: "translate(0, 0)", opacity: 1 }, { transform: `translate(${Math.cos(d) * len}px, ${Math.sin(d) * len}px)`, opacity: 0 }],
      { duration: 450 + Math.random() * 400, easing: "cubic-bezier(.22, 1, .36, 1)" },
    ).onfinish = () => el.remove();
  }

  function ripple(x, y) {
    const el = document.createElement("i");
    el.className = "flight-ripple";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${size * 1.2}px`;
    el.style.height = `${size * 0.5}px`;
    box.appendChild(el);
    el.animate(
      [{ transform: "translate(-50%, -50%) scale(.2)", opacity: 0.9 }, { transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 }],
      { duration: 900, easing: "cubic-bezier(.22, 1, .36, 1)" },
    ).onfinish = () => el.remove();
  }

  // state: flying, resting, or launching off after a click
  let mode = still ? "rest" : "wait";
  let t = still ? TOTAL : 0;
  let heading = REST;
  let launch = 0;
  let mouse = null;
  let prev = null;
  let landed = false;
  let burst = false;
  let arrival = null;
  let running = false;
  let last = 0;
  let measuring = 0; // seconds left in which the title may still move (its entrance)

  function restart() {
    t = 0;
    mode = "fly";
    prev = null;
    landed = burst = false;
    arrival = null;
    heading = REST;
    paint(0);
    wake();
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (measuring > 0) {
      measuring -= dt;
      measure();
    }
    if (mode === "wait") {
      // before the first flight the bolt is not on the page yet
    } else if (mode === "fly") {
      t = Math.min(t + dt, TOTAL);
      const f = path(t);
      bolt.style.zIndex = f.behind ? 1 : 3;
      const ahead = path(Math.min(t + 0.03, TOTAL)).p;
      const speed = Math.hypot(ahead.x - f.p.x, ahead.y - f.p.y) / 0.03;
      const dir = speed > 8 ? (Math.atan2(ahead.y - f.p.y, ahead.x - f.p.x) * 180) / Math.PI : heading;
      if (f.heading !== undefined) heading = f.heading;
      else if (f.landing !== undefined) {
        // rock from the angle it struck at down to rest, as a dart does
        if (arrival === null) arrival = Math.max(-45, Math.min(45, angleLerp(REST, heading, 1) - REST));
        heading = REST + arrival * Math.exp(-5 * f.landing) * Math.cos(f.landing * 16);
      } else heading = prev === null ? dir : angleLerp(heading, dir, 0.5);
      // the word fills with colour from its left as the bolt passes through, and stays lit
      if (f.paint !== undefined) paint(f.paint);
      if (f.seg >= 2) paint(1);
      place(f.p, heading, f.opacity ?? 1, f.seg === 4 ? 1 + 0.32 * f.spring : 1);
      if (f.seg === 1 && !burst) {
        burst = true;
        for (let i = 0; i < 16; i++) spark(f.p.x, f.p.y, 180 + (Math.random() * 120 - 60));
      }
      if (f.seg === 4 && !landed) {
        landed = true;
        ripple(geo.stop.x, geo.stop.y + size * 0.3);
        for (let i = 0; i < 12; i++) spark(f.p.x, f.p.y, 180 + (Math.random() * 160 - 80), COLORS[0]);
      }
      // sparks follow the bolt's speed
      if (prev && t < TOTAL && Math.random() < Math.min(0.9, speed / 700)) spark(f.p.x, f.p.y, heading + 180);
      prev = f.p;
      if (t >= TOTAL) mode = "rest";
    } else if (mode === "rest") {
      bolt.style.zIndex = 3;
      const S = geo.stop;
      const aim = mouse ? (Math.atan2(mouse.y - S.y, mouse.x - S.x) * 180) / Math.PI : REST;
      heading = angleLerp(heading, aim, 0.14);
      place(S, heading);
      // at rest, stop the loop once the bolt has turned to where it aims
      if (Math.abs(angleLerp(heading, aim, 1) - heading) < 0.2 && measuring <= 0) {
        running = false;
        return;
      }
    } else if (mode === "launch") {
      launch += dt;
      const S = geo.stop;
      const rad = (heading * Math.PI) / 180;
      const d = Math.pow(launch / 1.2, 2) * 800;
      const p = { x: S.x + Math.cos(rad) * d, y: S.y + Math.sin(rad) * d };
      place(p, heading, 1 - launch / 1.2);
      if (Math.random() < 0.5) spark(p.x, p.y, heading + 180);
      if (launch >= 1.2) restart();
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  const hero = box.closest("main") ?? box;
  hero.addEventListener(
    "pointermove",
    (e) => {
      const r = box.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (mode === "rest") wake();
    },
    { passive: true },
  );
  hero.addEventListener("pointerleave", () => {
    mouse = null;
    if (mode === "rest") wake();
  });
  title.addEventListener("click", () => {
    if (mode !== "rest" || still) return;
    mode = "launch";
    launch = 0;
    wake();
  });
  title.style.cursor = still ? "" : "pointer";
  new ResizeObserver(() => {
    measure();
    if (mode !== "wait") wake();
  }).observe(box);

  // keep measuring while the title makes its entrance (it slides up as it fades in)
  measure();
  measuring = 2.2;
  if (still) {
    paint(1);
    wake();
  } else setTimeout(restart, 600); // once the title has begun to fade in
}

startTitleFlight();
