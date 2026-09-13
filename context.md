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

The backend now has `Dockerfile`, `docker-entrypoint.sh`, `download_models.py`,
`.dockerignore`, `docker-compose.yml`, and `railway.json`.

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
