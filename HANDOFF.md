# Handoff

## Current state

Warden is Team DiddyP's Track 3 hackathon project. The ML prototype work is substantially complete, and a local FastAPI inference backend plus a first MV3 browser extension now exist.

Development tooling is configured:
- CYHI session logging is initialized for roll number `25bcs007`.
- OpenCode and Codex are installed and working.
- Root `AGENTS.md` contains the project contract and Warden rules.
- Shared skill directory exists at `.agents/skills/`.
- `warden-development/SKILL.md` is available.

Local ML assets, datasets, and notebooks now exist for the four planned features.

The backend can be started from the repository root with `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` after installing `requirements-backend.txt`.

Docker deployment files now exist: `Dockerfile`, `docker-entrypoint.sh`,
`download_models.py`, `.dockerignore`, `docker-compose.yml`, and `railway.json`.
Local Compose mounts the gitignored model and ledger directories; hosted startup
downloads public checkpoints from Hugging Face.

The Docker CPU image installs both CPU PyTorch and CPU TorchVision because the
NSFW image processor requires TorchVision at startup.

The current work is focused on the official browser extension. The files shown in
some editor tabs as `extension/popup.js`, `extension/content.js`, and similar
root-level paths are stale tabs from the deleted prototype. The maintained
extension is only under `extension/warden-extension/warden-extension/`.

## Works

- `notebooks/01_toxicity_finetuning.ipynb` fine-tunes local PyTorch Toxic-BERT on the Jigsaw toxicity data.
- `data/toxicity/train.csv` exists with 68.6 MB of data and the expected six toxicity labels.
- The toxicity model was successfully fine-tuned and saved in `models/toxic-bert-finetuned`.
- A successful validation run recorded:
  - eval loss: `0.024947596713900566`
  - macro F1: `0.7645593055288588`
  - macro ROC-AUC: `0.9962327571076283`
- `notebooks/02_nsfw_image_detection.ipynb` loads the local `Falconsai/nsfw_image_detection` model from `models/nsfw-image-detection`.
- The NSFW image detector currently supports a normal/NSFW decision and can drive a show/blur action.
- The NSFW notebook includes the Windows OpenMP workaround needed after the VS Code Jupyter kernel crashed with duplicate `libiomp5md.dll`.
- `notebooks/03_semantic_trigger_filter.ipynb` uses local `sentence-transformers/all-MiniLM-L6-v2` embeddings from `models/semantic-filter`.
- Semantic filtering combines title, caption, alt text, and account name. The current backend/notebook threshold is `0.25`, but it still needs calibration with user-labeled examples.
- `notebooks/04_prepost_toxicity_rewrite.ipynb` now performs a toxicity-only pre-post check. It returns category scores and the fixed warning: `This comment may be toxic. Please rethink it before posting.` It does not generate, alter, or submit replacement text.
- The old rewriter dataset and checkpoints remain as historical experiment artifacts, but rewriting is no longer part of the product flow.
- `app/main.py` exposes `/health`, `/toxicity`, `/prepost`, `/semantic`, and `/image/nsfw`.
- `app/inference.py` loads the local models once at startup and keeps API validation separate from model inference.
- `app/inference.py` optionally loads `darelphilip/hinglish-toxicity-classifier` from `models/hinglish-toxicity-classifier`. When present, it runs alongside Toxic-BERT and contributes Hinglish/code-mixed toxicity evidence; English Toxic-BERT remains active.
- The downloaded Hinglish checkpoint exposes seven labels: profanity/vulgarity, targeted abuse/harassment, discriminatory hate speech, caste, communal/religious, regional/xenophobic, and misogyny/gender. These labels are explicitly normalized into Warden's toxicity categories.
- `app/inference.py` also loads local `openai/clip-vit-base-patch32` from `models/image-semantic` for direct image-to-preference embeddings.
- `/semantic/image` compares an uploaded image with the user's preference in shared CLIP embedding space. This is separate from the sexual-content NSFW classifier.
- `app/ledger.py` provides append-only JSONL storage and session summaries for moderation events.
- The inference responses now include `trigger_detail` for text spans, matched semantic preferences, and whole-image NSFW decisions.
- The ledger endpoints are available at `/ledger/event`, `/ledger/summary`, and `/ledger/override`.
- `extension/warden-extension/warden-extension/` is the official MV3 extension (version `0.1.3`). It has Instagram/Reddit adapters, a settings UI, real backend classifier calls, image semantic preferences, compose warnings, ledger logging, and show-anyway overrides.
- The official content engine normalizes site-specific DOM data into post fields (`post_id`, platform, URL, author, title, text, alt text, and image metadata) before calling `/semantic` and using the same ID for ledger events.
- Comment filtering now uses comment-scoped DOM targets and independent cache IDs, so a toxic or semantically matched comment does not blur its enclosing post or sibling comments.
- Reveal is one-way for the current render: after the user clicks to view, the overlay is removed, interaction remains available, and the revealed decision is persisted in the session cache.
- Image semantic decisions use the calibrated `0.25` cutoff directly; image NSFW and semantic requests run in parallel, and DOM rescans are debounced to reduce sluggishness.
- Comment text blur no longer falls back to an enclosing article: unmatched comment text is blurred only at the matched text element, while recognized comments use their comment container.
- Version `0.1.3` is the selected behavior: post-level text/semantic decisions use the enclosing post, while recognized comments use only their comment container. Image NSFW blur remains post-scoped.

## Broken / limitations

- The official extension has starting Instagram/Reddit selectors, but those sites can change their DOM and still need end-to-end validation, especially comment containers.
- Cross-origin image fetches may prevent NSFW analysis for some remote image hosts; the extension fails open in that case.
- CLIP image-semantic filtering requires the additional local checkpoint in `models/image-semantic`; its similarity threshold is provisional and must be calibrated with image examples.
- The backend dependencies, especially `sentence-transformers`, must be installed before starting the service.
- The NSFW model is primarily a sexual-content detector. It should not be presented as a reliable gore or violence detector.
- The semantic threshold is provisional; `0.25` is not a measured final threshold.
- The Hinglish classifier is optimized for Romanized/code-mixed Hindi-English, not guaranteed for formal Devanagari-only Hindi. Its per-label thresholds and ensemble behavior still need evaluation on Warden's Hindi/Hinglish examples.
- The fine-tuned English toxicity checkpoint is local-only unless it is uploaded to a Hugging Face repository and supplied through `WARDEN_TOXICITY_REPO_ID`; Docker does not assume a repository for it.
- The fine-tuned English toxicity checkpoint is uploaded as `Abhid234/warden-toxic-bert`; use that value for `WARDEN_TOXICITY_REPO_ID` in hosted deployment.
- Rewriting was removed from the product because the generated text was unreliable and often copied the toxic input. The system should warn the user and let them decide how to revise it.
- Model weights and large datasets are local assets and should not be committed to git.
- `data/ledger/events.jsonl` is generated session data and should remain local rather than being committed as it grows.
- The latest datasets library cannot load the `google/jigsaw_toxicity_pred` script because dataset scripts are no longer supported. The existing CSV/parquet-backed data should be used instead.

## Next 3 things

1. Run `docker compose up --build` locally and smoke-test `/health`, `/toxicity`, `/semantic`, image routes, and the ledger.
2. For Railway, configure a persistent model volume/cache and `WARDEN_TOXICITY_REPO_ID` (plus `HF_TOKEN` if private), then deploy the Dockerfile.
3. Load the official extension and smoke-test Instagram/Reddit posts, comments, scroll recycling, permanent reveal, compose warnings, and semantic preferences against the container URL.

## Decisions (and why)

- Use local PyTorch models and `local_files_only=True` for reproducible offline inference.
- Use fine-tuned Toxic-BERT for multi-label toxicity scoring because it supports the required harassment-related categories.
- Use `Falconsai/nsfw_image_detection` for the initial sexual NSFW image filter, while explicitly excluding claims about gore detection.
- Use `all-MiniLM-L6-v2` for lightweight English semantic similarity. Raw images need OCR, captions, alt text, or a vision-text model before they can contribute semantic text similarity.
- Do not rewrite user comments automatically. For a toxic draft, show the toxicity evidence and ask the user to rethink or revise it themselves.
- Keep training code and inference code separate so models can be replaced without rewriting the application.
- Treat toxicity, semantic, and NSFW thresholds as tunable configuration rather than measured facts until calibration is complete.
- Prioritize a reliable end-to-end demo over adding more incomplete models.

## Don't retry

- Do not reinstall OpenCode or Codex; both are already working.
- Do not recreate `.agents/skills/` or `warden-development/SKILL.md`.
- Do not use the `google/jigsaw_toxicity_pred` dataset script with the current datasets library.
- Do not reintroduce the rewriter into the product flow unless a separately evaluated model demonstrates consistently useful, safe outputs.
- Do not claim semantic thresholds, NSFW coverage, or evaluation metrics that have not been measured.
- Do not add raw model weights or large local datasets to git.
- Do not load the deleted root-level `extension/` prototype; use the nested official extension folder or the rebuilt `extension/warden-extension.zip`.
