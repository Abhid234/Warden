# Warden

Warden is an AI/ML wellbeing layer between people and online communities. It
gives readers control over what reaches them by analyzing feed content before it
is displayed, then letting them decide whether to reveal anything that was
flagged.

Warden is designed as a browser extension backed by an open-source ML service.
It does not delete posts, rewrite people's comments, or replace the social
platform's moderation system. Its job is to provide a personal, transparent
filter for content such as harassment, sexual imagery, and user-defined topics.

## What Warden does

- Detects toxic and harassing text.
- Adds toxicity coverage for Romanized/code-mixed Hindi and English (Hinglish).
- Detects sexual or explicit images and blurs matching posts.
- Matches user-written topic preferences against post text and images.
- Warns users about toxic comments before they submit them.
- Blurs whole posts for image/topic matches while scoping toxicity blur to the
  matching comment.
- Lets users reveal a blurred item and preserves that choice while scrolling.
- Records moderation decisions and user overrides in a transparency ledger.
- Fails open when the backend is unavailable, leaving page content unchanged.

## Architecture

```text
Instagram / Reddit page
        |
        v
Browser extension observes the DOM and extracts structured posts/comments
        |
        v
FastAPI backend (local Docker or Railway)
        |
        +--> Fine-tuned Toxic-BERT + Hinglish toxicity classifier
        +--> NSFW image classifier
        +--> MiniLM text embeddings
        +--> CLIP image/text embeddings
        |
        v
allow / warn / blur / hide decision
        |
        +--> Extension updates the page
        +--> Ledger stores the decision and optional user override
```

The extension is responsible for DOM retrieval, caching, rendering, reveal
behavior, and platform-specific adapters. The backend is responsible for model
loading, inference, thresholds, API validation, and ledger persistence.

## Model pipeline

| Capability | Model | Input | Output |
| --- | --- | --- | --- |
| English toxicity | Fine-tuned `toxic-bert-finetuned` | Text | Toxicity score and six categories |
| Hinglish toxicity | `darelphilip/hinglish-toxicity-classifier` | Romanized/code-mixed text | Hinglish abuse, hate, and harassment scores |
| Image safety | `Falconsai/nsfw_image_detection` | Image | Sexual/explicit content score |
| Text semantics | `sentence-transformers/all-MiniLM-L6-v2` | Preference and post fields | Similarity score |
| Image semantics | `openai/clip-vit-base-patch32` | Preference and image | Image/text similarity score |

The NSFW model is a sexual-content detector; it is not a complete gore,
violence, or general harmful-image classifier. Semantic thresholds are
provisional and should be calibrated using user-labeled examples before making
accuracy claims.

Automatic comment rewriting was intentionally removed. The current pre-post
feature is warn-only: it tells the user that a draft may be toxic and asks them
to rethink it.

## Repository layout

```text
app/                              FastAPI routes and model inference
  main.py                         API endpoints and request validation
  inference.py                    Model loading and inference logic
  ledger.py                       Append-only ledger implementation
extension/warden-extension/       Official Chrome/Firefox extension
  warden-extension/
    manifest.json
    content-scripts/              Instagram and Reddit adapters
    lib/                          Shared storage and classifier logic
    popup/                        Settings and status UI
    options/                      Extension options page
notebooks/                        Training, evaluation, and model experiments
data/                             Local datasets and generated ledger data
models/                           Local model checkpoints; not committed
Dockerfile                        CPU production image
docker-compose.yml                Local Docker configuration
download_models.py                Clean-host model downloader
docker-entrypoint.sh              Startup download and Uvicorn command
railway.json                      Railway build and health-check configuration
requirements-backend.txt          Python backend dependencies
HANDOFF.md                        Development state and decisions
CONTEXT.md                        Agent and presentation context
```

Model weights and generated ledger files are intentionally excluded from git.
Do not commit credentials, API tokens, or large checkpoints.

## Backend: local Python setup

Python 3.11 is recommended because it matches the production container.

Install the backend dependencies from the repository root:

```powershell
python -m pip install -r requirements-backend.txt
```

The local API expects the required checkpoints in `models/`:

```text
models/toxic-bert-finetuned/
models/hinglish-toxicity-classifier/
models/nsfw-image-detection/
models/semantic-filter/
models/image-semantic/
```

The fine-tuned English toxicity checkpoint is not stored in git. The other
checkpoints can be downloaded from Hugging Face. For example:

```powershell
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Falconsai/nsfw_image_detection', local_dir='models/nsfw-image-detection')"
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='sentence-transformers/all-MiniLM-L6-v2', local_dir='models/semantic-filter')"
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='openai/clip-vit-base-patch32', local_dir='models/image-semantic')"
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='darelphilip/hinglish-toxicity-classifier', local_dir='models/hinglish-toxicity-classifier')"
```

Start the API from the repository root:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open the interactive API documentation at
[`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs).

Check that the service is ready:

```powershell
curl.exe http://127.0.0.1:8000/health
```

Expected shape:

```json
{"status":"ok","device":"cpu"}
```

## Backend: Docker

Docker is the recommended way to reproduce the backend environment. For local
development, Docker Compose mounts the existing local model folders and does
not download models during startup:

```powershell
docker compose up --build
```

The API is then available at `http://127.0.0.1:8000`. Stop it with `Ctrl+C`,
or run `docker compose down` from another terminal.

The production Docker image uses CPU PyTorch and CPU TorchVision. TorchVision
is required by the image processor even when no GPU is available. On a clean
host, `docker-entrypoint.sh` runs `download_models.py` before starting
Uvicorn. Model downloads use one Hugging Face worker by default to reduce
memory pressure on small deployment instances.

## Deploying to Railway

The repository contains a root `Dockerfile` and `railway.json`. Create a
Railway service connected to this repository and deploy the `main` branch.
Railway will build the Docker image and pass its assigned port through the
`PORT` environment variable.

The current deployed service is:

```text
https://warden-production-074e.up.railway.app
```

Useful Railway variables:

| Variable | Purpose |
| --- | --- |
| `WARDEN_TOXICITY_REPO_ID` | Hugging Face repository for the fine-tuned English model; defaults to `Abhid234/warden-toxic-bert` |
| `HF_TOKEN` | Only needed if the Hugging Face repository is private |
| `HF_MAX_WORKERS` | Model download concurrency; keep it at `1` on low-memory instances |
| `WARDEN_TOXICITY_THRESHOLD` | Toxicity warning threshold; default `0.40` |
| `WARDEN_NSFW_THRESHOLD` | NSFW threshold; default `0.50` |
| `WARDEN_SEMANTIC_THRESHOLD` | Semantic threshold; default `0.25` |

The Railway health check is `GET /health`. The first deployment can take a
while because the service downloads model checkpoints. The public root path
`/` is not an API route, so a `404 Not Found` there is expected; use
`/health` or `/docs` instead.

## Browser extension

The official extension is located at:

```text
extension/warden-extension/warden-extension/
```

To load it in Chrome:

1. Start the backend locally or use the deployed Railway URL configured in the
   extension.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select `extension/warden-extension/warden-extension/`.
6. Open Instagram or Reddit and refresh the page.

After changing extension files, press **Reload** on the extension card and
refresh the social-media tab. The extension version currently restored for the
post-filter behavior is `0.1.3`.

### What the extension extracts

For a post, the platform adapter collects structured fields where available:

```json
{
  "platform": "instagram",
  "post_id": "platform-specific-id",
  "url": "https://…",
  "author": "account name",
  "title": "",
  "caption": "visible caption text",
  "alt_text": "image alt text",
  "image_urls": ["https://…"]
}
```

Comments are treated as separate content items. A toxic comment can therefore
be blurred without blurring the entire post. The DOM is dynamic, so Warden
rescans content added during scrolling and uses a content cache to avoid
repeating the same backend request.

### Current user experience

- Image NSFW or semantic matches can blur the whole post.
- Toxicity matches on comments are scoped to the comment.
- The user can reveal a blurred item and continue interacting with it.
- A reveal is remembered while the feed recycles DOM nodes.
- A toxic draft produces a warning before it is submitted.
- If inference fails, content remains visible rather than being removed.

## API examples

### Toxicity

PowerShell:

```powershell
$body = @{ text = "You are such a loser" } | ConvertTo-Json -Compress
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/toxicity" `
  -ContentType "application/json" `
  -Body $body
```

The response includes the combined toxicity decision, category scores, model
names, trigger detail, and either `allow` or `warn`.

### Pre-post warning

`POST /prepost` accepts the same JSON body as `/toxicity`. It performs a
toxicity check without rewriting or storing the draft:

```powershell
$body = @{ text = "Tum bilkul pagal ho, chup karo" } | ConvertTo-Json -Compress
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/prepost" `
  -ContentType "application/json" `
  -Body $body
```

### Semantic text filtering

```powershell
$body = @{
  preference = "I want to avoid posts about war, armed conflict, and violence."
  post = @{
    title = "Border conflict escalates"
    caption = "Several countries deployed troops near the border."
    alt_text = "Military vehicles near a border"
    account_name = "Global News"
  }
} | ConvertTo-Json -Depth 4

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/semantic" `
  -ContentType "application/json" `
  -Body $body
```

### Image semantic filtering

```powershell
curl.exe -X POST "http://127.0.0.1:8000/semantic/image" `
  -F "preference=images of shirtless men" `
  -F "file=@C:\path\to\image.jpg"
```

### Ledger

The ledger is append-only. It records a decision, threshold, scores, trigger
detail, session, and post identifier without storing submitted image bytes.

- `POST /ledger/event` appends a moderation event.
- `GET /ledger/summary?session_id=...` returns session statistics and recent events.
- `POST /ledger/override` records a user's reveal decision as a new event.

## Development and notebooks

Training and inference are separated. The notebooks document the toxicity
fine-tuning, NSFW model checks, semantic filtering, and pre-post toxicity work.
The current product intentionally keeps the rewriter notebook/model as a
historical experiment rather than using automatic rewriting in production.

Before changing the project, read [`HANDOFF.md`](HANDOFF.md) for current
decisions and known issues. [`CONTEXT.md`](CONTEXT.md) contains the detailed
architecture and presentation context.

## Limitations and next steps

- Thresholds are hand-tuned and need calibration with user-labeled examples.
- The NSFW model does not reliably represent every kind of gore or violence.
- Hinglish coverage is strongest for Romanized/code-mixed text, not all Hindi.
- Social-media DOM structures change and platform adapters need maintenance.
- Railway currently runs CPU inference, so latency and memory are constraints.
- Evaluation should measure false positives, false negatives, latency, startup
  download time, and behavior under repeated scrolling.

## License and model attribution

Check the license and usage terms for every upstream model before redistributing
weights or deploying the service publicly. Warden's fine-tuned checkpoint and
application code should be documented separately from the licenses of the
upstream models used as starting points.
