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

Each non-blank response is sent to DeepSeek with a fixed rubric (`RATER_SYSTEM`
in `app.py`). The model returns one relative score from -5 to +5, an AI estimate
of how funny the response is compared with a broad adult respondent pool.

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

## Cost and reliability safeguards

- The final timer never submits automatically; a participant must explicitly
  request a result.
- The API accepts exactly eight unique responses, each limited to 280 characters.
- The default limit is four complete scoring attempts per IP per hour. Set
  `HIT_RATE_LIMIT_MAX` to change it.
- IP addresses are stored only as keyed hashes in `rate_limits.sqlite3`; set
  `HIT_IP_HASH_SECRET` to a long random production secret.
- A DeepSeek request has a 30-second timeout by default. A provider error returns
  a clear error rather than a mock score.
- Anonymous telemetry records completion/failure, model-call count, token counts,
  and latency. It never stores answers or raw IP addresses.

On the server, inspect daily aggregate telemetry with:

```bash
sqlite3 /home/admin/project/testhumor/rate_limits.sqlite3 \
  "SELECT date(created_at, 'unixepoch') AS day, outcome, COUNT(*) AS tests, \
  SUM(model_calls) AS calls, SUM(prompt_tokens + completion_tokens) AS tokens, \
  ROUND(AVG(elapsed_ms)) AS avg_ms FROM score_events GROUP BY day, outcome;"
```

## Deploying

Any Python host works (Render, Fly, Railway, a small VM). For production use a
WSGI server instead of the dev server, e.g.:

```bash
pip install gunicorn
gunicorn app:app --bind 127.0.0.1:8000
```

The production deployment serves the page and API from the same domain. Keep the
Gunicorn listener private behind Nginx; the app does not enable cross-origin API
access.

## Endpoints

- `GET  /`            — the test UI
- `GET  /api/prompts` — the test items (no rubric leaked to the client)
- `POST /api/score`   — body `{"responses":[{"id","text"}, …]}` → aggregate + breakdown
- `GET  /healthz`     — mode/model check
