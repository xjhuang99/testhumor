/* Humor Intelligence Test — front end
 * Talks to the Flask backend. If you host this page separately from the API
 * (e.g. embedded in ACTR), set API_BASE to the API origin, e.g.
 * const API_BASE = "https://api.actr.org";
 */
const API_BASE = "";

const $ = (id) => document.getElementById(id);
const screens = {
  intro:   $("screen-intro"),
  test:    $("screen-test"),
  scoring: $("screen-scoring"),
  results: $("screen-results"),
};

let items = [];
let answers = {};       // id -> text
let cursor = 0;

const SCORING_LINES = [
  "Reading the room…",
  "Timing the pauses…",
  "Consulting the laugh track…",
  "Weighing wit against delivery…",
  "Checking who laughed first…",
];

function show(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------- load ------------------------------- */
async function loadPrompts() {
  try {
    const res = await fetch(`${API_BASE}/api/prompts`);
    const data = await res.json();
    items = data.items || [];
  } catch (err) {
    console.error(err);
    alert("Couldn't load the test. Is the backend running?");
  }
}

/* --------------------------- render a prompt --------------------------- */
function renderPrompt() {
  const item = items[cursor];
  $("progress-label").textContent = `Prompt ${cursor + 1} of ${items.length}`;
  $("progress-fill").style.width = `${(cursor / items.length) * 100}%`;

  $("prompt-kicker").textContent = item.kicker || "Prompt";
  $("prompt-setup").textContent = item.setup;

  const imgWrap = $("prompt-image");
  if (item.image) {
    imgWrap.hidden = false;
    imgWrap.innerHTML =
      `<img src="${item.image}" alt="${item.image_alt || "prompt image"}" />`;
  } else {
    imgWrap.hidden = true;
    imgWrap.innerHTML = "";
  }

  const input = $("answer-input");
  input.value = answers[item.id] || "";
  updateCounter();
  $("next-btn").textContent = cursor === items.length - 1 ? "See my score" : "Next";
  input.focus();
}

function updateCounter() {
  const input = $("answer-input");
  $("counter").textContent = `${input.value.length} / 280`;
}

/* ------------------------------ advance ------------------------------ */
function advance(skip = false) {
  const item = items[cursor];
  answers[item.id] = skip ? "" : $("answer-input").value.trim();

  if (cursor < items.length - 1) {
    cursor += 1;
    renderPrompt();
  } else {
    submit();
  }
}

/* ------------------------------ submit ------------------------------ */
async function submit() {
  show("scoring");
  let i = 0;
  $("scoring-text").textContent = SCORING_LINES[0];
  const rotator = setInterval(() => {
    i = (i + 1) % SCORING_LINES.length;
    $("scoring-text").textContent = SCORING_LINES[i];
  }, 1500);

  const payload = {
    responses: items.map((it) => ({ id: it.id, text: answers[it.id] || "" })),
  };

  try {
    const res = await fetch(`${API_BASE}/api/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    clearInterval(rotator);
    if (data.error) throw new Error(data.error);
    renderResults(data);
  } catch (err) {
    clearInterval(rotator);
    console.error(err);
    $("scoring-text").textContent = "Something went wrong. Please try again.";
  }
}

/* ------------------------------ results ------------------------------ */
let lastResult = null;

function renderResults(data) {
  lastResult = data;
  show("results");

  $("result-band").textContent = data.band;
  $("result-blurb").textContent = data.band_blurb;
  $("result-style").textContent = data.style;

  // dimension bars
  const dimNames = { wit: "Wit", originality: "Originality", relevance: "Relevance", delivery: "Delivery" };
  const dimsEl = $("result-dims");
  dimsEl.innerHTML = "";
  Object.entries(data.dimensions).forEach(([key, val]) => {
    const row = document.createElement("div");
    row.className = "dim";
    row.innerHTML =
      `<span class="dim__name">${dimNames[key] || key}</span>` +
      `<span class="dim__track"><span class="dim__fill"></span></span>` +
      `<span class="dim__val">${val}</span>`;
    dimsEl.appendChild(row);
    requestAnimationFrame(() => {
      row.querySelector(".dim__fill").style.width = `${val}%`;
    });
  });

  // per-answer breakdown
  const list = $("breakdown-list");
  list.innerHTML = "";
  data.breakdown.forEach((b) => {
    const item = document.createElement("div");
    item.className = "breakdown__item";
    const empty = !b.answer;
    item.innerHTML =
      `<p class="breakdown__setup">${escapeHtml(b.setup)}</p>` +
      `<p class="breakdown__answer${empty ? " is-empty" : ""}">` +
      `${empty ? "(skipped)" : escapeHtml(b.answer)}</p>` +
      `<div class="breakdown__meta">` +
      `<p class="breakdown__note">${escapeHtml(b.note || "")}</p>` +
      `<span class="breakdown__score">${b.score}/100</span></div>`;
    list.appendChild(item);
  });

  const flag = $("mode-flag");
  if (data.mode === "demo") {
    flag.hidden = false;
    flag.textContent = "Demo mode — set DEEPSEEK_API_KEY on the server for real scoring.";
  } else {
    flag.hidden = true;
  }

  animateMeter(data.overall);
}

/* animate needle sweep + arc fill + score count-up */
function animateMeter(score) {
  const needle = $("needle");
  const arc = $("result-arc");
  const readout = $("result-score");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduce ? 0 : 1300;
  const start = performance.now();

  function frame(now) {
    const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const v = score * eased;
    const angle = -90 + (v / 100) * 180;
    needle.setAttribute("transform", `rotate(${angle} 120 130)`);
    arc.setAttribute("stroke-dasharray", `${v} 100`);
    readout.textContent = Math.round(v);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------ helpers ------------------------------ */
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function restart() {
  answers = {};
  cursor = 0;
  renderPrompt();
  show("test");
}

async function copyResult() {
  if (!lastResult) return;
  const text =
    `My Humor Intelligence: ${lastResult.overall}/100 — "${lastResult.band}".\n` +
    `Wit ${lastResult.dimensions.wit} · Originality ${lastResult.dimensions.originality} · ` +
    `Relevance ${lastResult.dimensions.relevance} · Delivery ${lastResult.dimensions.delivery}.\n` +
    `Test yourself: the Humor Intelligence Test, powered by ACTR.`;
  try {
    await navigator.clipboard.writeText(text);
    const btn = $("copy-btn");
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = original), 1600);
  } catch {
    alert(text);
  }
}

/* ------------------------------ wiring ------------------------------ */
$("start-btn").addEventListener("click", () => {
  show("test");
  cursor = 0;
  renderPrompt();
});
$("next-btn").addEventListener("click", () => advance(false));
$("skip-btn").addEventListener("click", () => advance(true));
$("retake-btn").addEventListener("click", restart);
$("copy-btn").addEventListener("click", copyResult);
$("answer-input").addEventListener("input", updateCounter);
$("answer-input").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") advance(false);
});

loadPrompts();
