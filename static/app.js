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
let timerId = null;
let isSubmitting = false;

const SCORING_LINES = [
  "Reviewing your responses…",
  "Looking for the unexpected…",
  "Preparing your result…",
];

function show(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restoreSavedResult() {
  try {
    const saved = sessionStorage.getItem("humor-test-result");
    if (!saved) return;
    const result = JSON.parse(saved);
    if (typeof result.overall === "number" && result.band && Array.isArray(result.breakdown)) {
      renderResults(result);
    }
  } catch {
    sessionStorage.removeItem("humor-test-result");
  }
}

/* ------------------------------- load ------------------------------- */
async function loadPrompts() {
  try {
    const res = await fetch(`${API_BASE}/api/prompts`);
    const data = await res.json();
    items = (data.items || []).slice(0, data.test_item_count || data.items.length);
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
  input.disabled = false;
  input.value = answers[item.id] || "";
  $("skip-btn").disabled = false;
  $("timeout-message").hidden = true;
  $("timer").classList.remove("is-expired");
  updateCounter();
  $("next-btn").textContent = cursor === items.length - 1 ? "See my score" : "Next";
  input.focus();
  startTimer(item.time_limit || 30);
}

function startTimer(seconds) {
  clearInterval(timerId);
  let remaining = seconds;
  const timer = $("timer");
  const draw = () => {
    timer.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  };
  draw();
  timerId = setInterval(() => {
    remaining -= 1;
    draw();
    if (remaining <= 0) {
      clearInterval(timerId);
      timerId = null;
      advance(false, true);
    }
  }, 1000);
}

function updateCounter() {
  const input = $("answer-input");
  $("counter").textContent = `${input.value.length} / 280`;
}

/* ------------------------------ advance ------------------------------ */
function advance(skip = false, timedOut = false) {
  clearInterval(timerId);
  timerId = null;
  const item = items[cursor];
  answers[item.id] = skip ? "" : $("answer-input").value.trim();

  if (cursor < items.length - 1) {
    cursor += 1;
    renderPrompt();
  } else if (timedOut) {
    $("answer-input").disabled = true;
    $("skip-btn").disabled = true;
    $("next-btn").textContent = "See my score";
    $("timer").textContent = "Time's up";
    $("timer").classList.add("is-expired");
    $("timeout-message").hidden = false;
  } else {
    submit();
  }
}

/* ------------------------------ submit ------------------------------ */
async function submit() {
  if (isSubmitting) return;
  isSubmitting = true;
  clearInterval(timerId);
  timerId = null;
  show("scoring");
  $("scoring-actions").hidden = true;
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
    $("scoring-text").textContent = err.message || "Something went wrong. Please try again.";
    $("scoring-actions").hidden = false;
    isSubmitting = false;
  }
}

/* ------------------------------ results ------------------------------ */
let lastResult = null;

function renderResults(data) {
  lastResult = data;
  try {
    sessionStorage.setItem("humor-test-result", JSON.stringify(data));
  } catch {
    // The current result remains visible if session storage is unavailable.
  }
  show("results");

  $("result-band").textContent = data.band;
  $("result-blurb").textContent = data.band_blurb;
  $("result-style").textContent = data.style;

  // Per-answer feedback intentionally omits internal rating values and formulas.
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
      `<p class="breakdown__note">${escapeHtml(b.note || "")}</p></div>`;
    list.appendChild(item);
  });

  const flag = $("mode-flag");
  if (data.mode === "demo") {
    flag.hidden = false;
    flag.textContent = "Demo mode — set DEEPSEEK_API_KEY on the server for real scoring.";
  } else {
    flag.hidden = true;
  }

  animateScore(data.overall);
}

function animateScore(score) {
  const readout = $("result-score");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduce ? 0 : 1300;
  const start = performance.now();

  function frame(now) {
    const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const v = score * eased;
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
  clearInterval(timerId);
  timerId = null;
  answers = {};
  cursor = 0;
  isSubmitting = false;
  sessionStorage.removeItem("humor-test-result");
  renderPrompt();
  show("test");
}

async function copyResult() {
  if (!lastResult) return;
  const text =
    `My Humor Intelligence: ${lastResult.overall}/200 — "${lastResult.band}".\n` +
    `AI-estimated from eight timed prompts.\n` +
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
  sessionStorage.removeItem("humor-test-result");
  show("test");
  cursor = 0;
  renderPrompt();
});
$("next-btn").addEventListener("click", () => advance(false));
$("skip-btn").addEventListener("click", () => advance(true));
$("retake-btn").addEventListener("click", restart);
$("copy-btn").addEventListener("click", copyResult);
$("retry-btn").addEventListener("click", submit);
$("restart-from-error-btn").addEventListener("click", restart);
$("answer-input").addEventListener("input", updateCounter);
$("answer-input").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") advance(false);
});

loadPrompts();
restoreSavedResult();
