# Warden

Warden is an AI wellbeing layer between people and online communities.

## Run the local backend

Install the backend dependencies from the project environment:

```powershell
python -m pip install -r requirements-backend.txt
```

Start the API from the repository root:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the interactive API documentation.

## Run with Docker

For local Docker, keep the downloaded checkpoints in `models/` and run:

```powershell
docker compose up --build
```

The Compose service mounts `models/` and `data/ledger/` into the container and
serves the API at `http://127.0.0.1:8000`.

For a clean host such as Railway, the container downloads the public checkpoints
at startup. Set `WARDEN_TOXICITY_REPO_ID` to a Hugging Face repository containing
the fine-tuned `toxic-bert-finetuned` checkpoint. The downloader defaults to
`Abhid234/warden-toxic-bert`; set `WARDEN_TOXICITY_REPO_ID` to override it.
Set `HF_TOKEN` only when that repository is private.

The API loads local model folders from `models/` at startup. It does not persist submitted images. Moderation events are appended to `data/ledger/events.jsonl` for the transparency ledger; keep this generated file local.

## Ledger endpoints

- `POST /ledger/event` appends one moderation event and generates its `event_id` and timestamp when omitted.
- `GET /ledger/summary?session_id=...` returns counts, score buckets, and recent events for one browser session.
- `POST /ledger/override` appends an immutable `overridden` event referencing the original event.

The image-semantic endpoint is `POST /semantic/image`. It accepts a multipart image plus a `preference` field and compares them in CLIP's shared image/text embedding space.

Download the local CLIP checkpoint once:

```powershell
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='openai/clip-vit-base-patch32', local_dir='models/image-semantic')"
```

The model is loaded locally with `local_files_only=True`; it is not downloaded when the API starts.

## Load the browser extension

1. Start the backend on `http://127.0.0.1:8000`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select `extension/warden-extension/warden-extension/`.
4. Open a page containing `article` or `[role="article"]` feed items.

The official extension is in `extension/warden-extension/warden-extension/`. It fails open when the backend is unavailable: it leaves page content unchanged and creates no ledger event.
