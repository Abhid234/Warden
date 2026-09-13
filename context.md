# CONTEXT.md — for Codex / opencode

Read this first, then read `HANDOFF.md` in the repo root, then look at the
actual files below before changing anything. Do not assume any file contents,
paths, or model names beyond what's written in HANDOFF.md until you've opened
and confirmed them yourself — HANDOFF.md is a summary, not a guarantee of exact
paths or current code state.

## What this project is

Warden — a hackathon project (Track 3, "AI/ML: A Layer Between You and the
Noise"). It's a wellbeing layer that filters a social feed before content
renders, using locally-trained/hosted models rather than commercial LLM APIs.
Four features: toxicity classification, NSFW image tagging, a semantic
"trigger phrase" filter using embeddings, and a pre-post toxicity check on
drafts (warn-only, no auto-rewrite).

## Files to actually open before doing anything

- `HANDOFF.md` — current state, decisions made and why, and a "don't retry"
  list. Follow it; don't re-litigate settled decisions without asking.
- `app/main.py` — FastAPI app, exposes the four inference endpoints.
- `app/inference.py` — model loading and inference logic, separate from API
  validation by design (see HANDOFF.md decisions).
- `requirements-backend.txt` — backend dependencies.
- `notebooks/01_toxicity_finetuning.ipynb` through
  `notebooks/04_prepost_toxicity_rewrite.ipynb` — training/eval notebooks for
  each model. Don't re-run these unless asked; they're already validated per
  HANDOFF.md.
- `models/` — local fine-tuned weights and downloaded base models. Gitignored,
  large, never commit these.
- `data/` — training data and the ledger's event log once built. Also
  gitignored where large.
- `.agents/skills/` and `warden-development/SKILL.md` — existing project-specific
  agent skill config. Do not recreate these; they already exist.
- `AGENTS.md` (repo root) — project contract and Warden-specific rules. Read
  and follow it.

## Current architecture (per HANDOFF.md, confirm against real code)

- `/health`, `/toxicity`, `/prepost`, `/semantic`, `/image/nsfw` — existing
  endpoints in `app/main.py`.
- Toxicity: fine-tuned Toxic-BERT, local, `models/toxic-bert-finetuned`.
- NSFW: `Falconsai/nsfw_image_detection`, local, `models/nsfw-image-detection`.
- Semantic filter: `sentence-transformers/all-MiniLM-L6-v2`, local,
  `models/semantic-filter`. Combines title, caption, alt text, account name.
- Pre-post: toxicity-only check on drafts, fixed warning message, no rewriting.
  Rewriter model exists in `models/` as a historical artifact but is NOT part
  of the product flow — do not reintroduce without asking first.

## Work in flight (in priority order — check with the user which is active)

1. **Backend smoke test** — confirm all four endpoints work end-to-end
   (HANDOFF.md "Next 3 things" #1).
2. **Transparency ledger** — a new logging/aggregation layer on top of the
   existing four endpoints. Full spec in `LEDGER_SPEC.md` if present in the
   repo/handoff — implements `/ledger/event`, `/ledger/summary`,
   `/ledger/override`, plus `trigger_detail` additions to the four existing
   endpoints. This is additive only — no new ML models.
3. **Performance/batching pass** — batch inference instead of per-post calls,
   `model.eval()`/`no_grad()` checks, caching by content hash, async endpoint
   handling so one slow request doesn't block others. No new models here
   either — this is about how existing models are called, not replacing them.
4. **Deployment** — Docker-based deploy to Railway. Needs a `Dockerfile`,
   `.dockerignore`, and a `download_models.py` that pulls model weights from
   Hugging Face Hub at container startup (since `models/` is gitignored and
   Railway builds from GitHub). See `DEPLOY.md` if present for the exact
   Dockerfile and steps.
5. **Browser extension** — not yet built. Content script extracts feed posts,
   calls the backend, applies blur/hide/warn actions, fails open (shows
   content unmodified) if the backend is unreachable. Popup UI shows the
   ledger.

## Hard constraints — do not violate these regardless of what seems efficient

- Never commit `models/` weights or large `data/` files to git.
- Never reintroduce automatic comment rewriting into the product flow — this
  was explicitly removed because generated rewrites were unreliable (often
  copied the toxic input verbatim). Warn-only is the current, deliberate
  design.
- Never claim a threshold, accuracy number, or coverage claim (e.g. "handles
  gore," "94% accurate") that hasn't actually been measured on held-out data.
  The NSFW model is a sexual-content detector only — do not describe it as a
  general harmful-image or violence detector.
- Don't reinstall OpenCode/Codex, don't recreate `.agents/skills/` or
  `warden-development/SKILL.md` — already set up.
- Don't use the `google/jigsaw_toxicity_pred` HF dataset script — incompatible
  with the current `datasets` library version; use the existing CSV/parquet
  files in `data/toxicity/` instead.
- Extension must fail safely: if the backend is unreachable, show feed content
  unmodified rather than blocking or breaking the page.

## Docker deployment

The Docker image installs CPU PyTorch together with CPU TorchVision. TorchVision
is required by the NSFW image processor even though the container does not use a
GPU.

Model downloads use one Hugging Face worker by default via `HF_MAX_WORKERS=1`.
This is slower than the default concurrent download but avoids Railway
out-of-memory kills while downloading the large Toxic-BERT and Hinglish files.

The backend now has `Dockerfile`, `docker-entrypoint.sh`, `download_models.py`,
`.dockerignore`, `docker-compose.yml`, and `railway.json`.

The deployed backend URL is:

```text
https://warden-production-074e.up.railway.app
```

The root path is not an API route; use `/health`, `/toxicity`, `/semantic`,
and the other documented endpoints.

For local Docker, run from the repository root:

```powershell
docker compose up --build
```

Compose sets `WARDEN_DOWNLOAD_MODELS=0` and mounts the existing gitignored
`models/` and `data/ledger/` directories. Check the service at
`http://127.0.0.1:8000/health`.

For Railway or another clean host, startup downloads the public Hugging Face
models. The fine-tuned English toxicity model is not committed to git, so the
deployment must either mount `models/toxic-bert-finetuned` or set
`download_models.py` defaults to
`WARDEN_TOXICITY_REPO_ID=Abhid234/warden-toxic-bert`. You can override it with
the same Railway variable if needed. Set `HF_TOKEN` as well if the repository
is private.

Model downloads may make the first startup slow. Never claim the Docker image
contains weights unless they were actually built into or mounted into it.

## When in doubt

If a task references a file, path, model name, or endpoint not confirmed to
exist in the actual repo, stop and check the real file rather than assuming
it matches this document or HANDOFF.md exactly — both are written as guidance,
not as a live snapshot of the code.


## PPT / presentation context

Use this section as the source of truth for a presentation about Warden. The
presentation should explain the product as a reader-controlled wellbeing layer,
not as a replacement for the social platform or a system that silently decides
what people are allowed to see.

### One-sentence pitch

Warden is an AI/ML layer between a person and an online community that detects
harmful, unwanted, or personally triggering content before it reaches the
reader, then lets the reader decide whether to reveal it.

### Problem

Most moderation happens after content is posted or reported. A reader still has
to encounter the content first. People also have different boundaries: one
person may want to avoid violence, another may want to avoid sexual imagery,
and another may mainly want help with harassment or toxic comments.

### Product goal

Give the reader control over their feed using local/open-source ML models and a
browser extension. Warden should warn, blur, or hide content without deleting
it. The user can reveal blurred content and can change preferences over time.

### End-to-end architecture

```text
Instagram / Reddit page
        |
        v
Browser extension observes the DOM and extracts structured content
        |
        v
Railway-hosted FastAPI backend
        |
        +--> Toxicity models: English Toxic-BERT + Hinglish classifier
        +--> Image safety model: NSFW image classifier
        +--> Semantic text model: MiniLM embeddings
        +--> Semantic image model: CLIP image/text embeddings
        |
        v
Decision: allow, warn, blur, or hide
        |
        +--> Extension updates the page and preserves user reveal state
        +--> Ledger records the decision and optional user override
```

### Suggested slide order

1. Title: Warden - an AI/ML layer between you and the noise.
2. Problem: readers encounter harmful content before moderation can help.
3. Goal: reader-side, preference-driven control instead of one global rule.
4. Architecture: extension -> FastAPI -> models -> decision -> UI/ledger.
5. DOM retrieval: how a post or comment becomes structured input.
6. Toxicity detection: English and Hinglish/code-mixed text scoring.
7. Image protection: NSFW classification plus image semantic matching.
8. Semantic preferences: natural-language preferences converted to embeddings.
9. Pre-post protection: warn a user before a toxic comment is submitted.
10. Browser experience: post blur, comment-only blur, reveal, and scrolling cache.
11. Transparency ledger: decisions, trigger details, and user overrides.
12. Deployment: Dockerized FastAPI service running on Railway.
13. Live demo: health check, API calls, feed filtering, reveal, and compose warn.
14. Limitations and next steps: calibration, more platforms, and evaluation.

### Extension responsibilities

The content script watches dynamically loaded feed content with a MutationObserver
and rescans when the platform adds or reuses nodes. It extracts fields such as
platform, post id, URL, author, title, caption, visible text, alt text, image
URLs, and comment text. Posts are sent as one structured item; comments are
sent as separate items so only the matching comment is blurred.

The extension applies the result to the page. NSFW or semantic matches can blur
the whole post. Toxic comments are scoped to the comment. A revealed item is
marked so a later scroll or DOM rerender does not immediately blur it again.
The cache reduces repeated backend requests and helps restore the blur after
virtualized feeds recycle DOM nodes. If the backend is unavailable, the
extension fails safely and does not remove content.

### Model pipeline

- Toxicity: the fine-tuned `toxic-bert-finetuned` model scores English text.
- Hinglish: `darelphilip/hinglish-toxicity-classifier` adds scores for
  Romanized/code-mixed Hindi and English, including harassment and hate-related
  categories.
- NSFW images: `Falconsai/nsfw_image_detection` detects sexual or explicit
  imagery. It should not be presented as a dedicated gore or violence detector.
- Text semantics: `sentence-transformers/all-MiniLM-L6-v2` compares a user
  preference with post text, captions, titles, alt text, and account context.
- Image semantics: CLIP compares the user preference with the image itself,
  allowing image-only content to participate in semantic filtering.
- The current semantic image threshold is 0.25 and should be described as a
  practical provisional threshold, not as a measured universal accuracy result.

### Backend API surface

The deployed service is:

`https://warden-production-074e.up.railway.app`

Important routes for the demo are:

- `GET /health` - confirms the service and reports the active device.
- `POST /toxicity` - scores text with both toxicity models.
- `POST /prepost` - checks a draft before posting.
- `POST /semantic` - compares a preference with structured post text.
- `POST /image/nsfw` - checks an uploaded image for NSFW content.
- `POST /semantic/image` - compares a preference with an uploaded image.
- `POST /ledger/event`, `/ledger/summary`, `/ledger/override` - transparency
  and user-control endpoints.

### Docker and Railway story

The backend is packaged in a CPU Docker image. At startup it downloads public
Hugging Face checkpoints and the uploaded Warden toxicity checkpoint when they
are not already available. Railway supplies the port through `PORT`; Uvicorn
serves `app.main:app`; `/health` is the deployment health check. Model and
ledger directories are mounted or persisted so restarts do not need to repeat
all work. Startup can be slow and CPU inference is a known tradeoff.

### Transparency and user control

Every decision can expose the model score, categories, trigger detail, action,
and model names. The ledger records the event without silently changing the
user's content. An override records that the user chose to reveal or keep an
item hidden. This makes the system explainable and gives the final decision
back to the reader.

### Live demo script

1. Open `/health` and show the Railway service is running.
2. Call `/toxicity` with an English abusive sentence and show `action: warn`.
3. Call `/toxicity` with a Romanized Hindi sentence and show the Hinglish score.
4. Open Instagram or Reddit with the extension enabled.
5. Show a semantic preference such as avoiding war or violence.
6. Show a matching post blurred, then reveal it with the user control.
7. Show a toxic comment where only the comment is blurred, not the full post.
8. Open the popup or ledger view and show the decision/override record.
9. Type a toxic draft comment and show the pre-post warning before submission.

### Honest limitations

Thresholds are currently hand-tuned and need calibration with user-labeled
relevant/irrelevant examples. The NSFW model is not a complete gore, violence,
or medical-image classifier. The Hinglish model is strongest on Romanized or
code-mixed text and should not be described as full Hindi-language coverage.
Social-media DOM structures change, so platform adapters need maintenance.
Railway runs the current service on CPU, so latency and memory are practical
constraints. The next evaluation should measure false positives, false
negatives, latency, model download time, and the effect of repeated scrolling.
