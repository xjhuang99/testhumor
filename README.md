# Humor Intelligence Test

A self-contained prototype of the online Humor Intelligence Test: readers open a
link, complete eight timed comedic prompts, and get an immediate, LLM-scored result
with per-answer feedback and a read on their comedic style.

- **Backend:** Python / Flask (`app.py`) — serves the page, hands out the test
  items, and scores responses via the **DeepSeek** API (OpenAI-compatible).
- **Frontend:** vanilla HTML/CSS/JS (`templates/`, `static/`) — no build step,
  drops into any host.

## Run it

```bash
pip install -r requirements.txt
python app.py                 # opens on http://localhost:5000
```

It runs immediately in **demo mode** with deterministic mock scores — no API key
needed — so you can click all the way through. For real scoring, set your key (never commit it):

```bash
export DEEPSEEK_API_KEY=sk-...
python app.py
```

Or copy `.env.example` to `.env` and add your key there (`.env` is gitignored).

## How scoring works

Each response is sent to DeepSeek with a fixed rubric (`RATER_SYSTEM` in
`app.py`). The model returns one relative score from -5 to +5, an AI estimate of
how funny the response is compared with a broad adult respondent pool.

Per-response score = a relative integer from -5 to +5. The overall score is
`100 + 20 × mean(relative scores)`, producing a 0–200 result. This makes 100
the intended broad-average anchor, but it is an AI estimate rather than a
validated norm and cannot guarantee a live sample SD of 15 without RA data.
A second call writes the "comedic style" paragraph. Temperature is held low
(0.2) so scores are stable and repeatable.

## Customizing

- **Items** live in `prompts.json`. Add, remove, or reword freely. Each needs a
  unique `id`, a `type`, a `kicker`, and a `setup`. Add an optional `image`
  (a path under `static/`) to make any item a picture-caption item.
- **Cartoons.** The two demo scenes are original placeholder SVGs. Drop your
  licensed cartoon images into `static/img/` and point the item's `image` field
  at them.
- **Bands & rubric.** `BANDS` and `RATER_SYSTEM` in `app.py` are the two knobs
  for calibration — see below.
- **Model.** Defaults to DeepSeek `deepseek-chat`; set `HIT_MODEL` to change it
  (e.g. `deepseek-reasoner`).

## Calibrating against your RA-coded data

Because the historical results were human-coded, you can validate the automated
scores directly: run a set of previously coded responses through `/api/score`
and correlate the model's per-item scores with your RAs' codes. Then adjust the
`RATER_SYSTEM` anchors and the `BANDS` cutoffs until the automated bands line up
with the human norms. Holding temperature low keeps this reproducible. For a
published instrument you may also want an inter-rater check (e.g. score each
response 3× and average) — the hook for that is `_rate_one` in `app.py`.

## Deploying

Any Python host works (Render, Fly, Railway, a small VM). For production use a
WSGI server instead of the dev server, e.g.:

```bash
pip install gunicorn
gunicorn app:app --bind 0.0.0.0:8000
```

If ACTR hosts the page and the API separately, set `API_BASE` at the top of
`static/app.js` to the API origin. CORS is already enabled server-side.

## Endpoints

- `GET  /`            — the test UI
- `GET  /api/prompts` — the test items (no rubric leaked to the client)
- `POST /api/score`   — body `{"responses":[{"id","text"}, …]}` → aggregate + breakdown
- `GET  /healthz`     — mode/model check
